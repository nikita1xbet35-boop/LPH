import type { Env } from './types';
import { handleOptions, withCors, err } from './lib/cors';
import { verifyJWT } from './lib/jwt';
import { handleAuth } from './routes/auth';
import { handleUsers } from './routes/users';
import { handleConversations } from './routes/conversations';
import { handleMessages } from './routes/messages';
import { handleAdmin } from './routes/admin';
import { handleSetup } from './routes/setup';

export { ChatRoom } from './durable/ChatRoom';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Preflight
    if (request.method === 'OPTIONS') return handleOptions(env, request);

    // WebSocket endpoint
    if (path === '/ws') {
      return handleWebSocket(request, env, url);
    }

    let response: Response;

    if (path === '/api/setup/init') {
      response = await handleSetup(request, env);
    } else if (path.startsWith('/api/auth/')) {
      response = await handleAuth(request, env, path);
    } else if (path.startsWith('/api/admin/')) {
      response = await handleAdmin(request, env, path);
    } else if (path.startsWith('/api/users')) {
      response = await handleUsers(request, env, path);
    } else if (path.startsWith('/api/conversations') || path.startsWith('/api/messages')) {
      const isConvMessages = path.match(/^\/api\/conversations\/[^/]+\/messages/);
      // GET сообщений — в handleConversations, POST/DELETE/read — в handleMessages
      if (isConvMessages && request.method !== 'GET') {
        response = await handleMessages(request, env, path);
      } else if (path.startsWith('/api/messages')) {
        response = await handleMessages(request, env, path);
      } else {
        response = await handleConversations(request, env, path);
      }
    } else {
      response = err('not_found', 'Not found', 404, env, request);
    }

    return withCors(response, env, request);
  },
};

async function handleWebSocket(request: Request, env: Env, url: URL): Promise<Response> {
  const token = url.searchParams.get('token');
  const conversationId = url.searchParams.get('conversation_id');

  if (!token || !conversationId) {
    return new Response('token and conversation_id required', { status: 400 });
  }

  const payload = await verifyJWT(env.JWT_SECRET, token);
  if (!payload) return new Response('unauthorized', { status: 401 });

  // Проверяем сессию
  const session = await env.DB.prepare(
    'SELECT 1 FROM sessions WHERE token_id = ? AND expires_at > ?'
  ).bind(payload.jti, Math.floor(Date.now() / 1000)).first();
  if (!session) return new Response('unauthorized', { status: 401 });

  // Проверяем членство в чате
  const member = await env.DB.prepare(
    'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
  ).bind(conversationId, payload.sub).first();
  if (!member) return new Response('forbidden', { status: 403 });

  // Форвардим в Durable Object с user_id
  const doId = env.CHAT_ROOM.idFromName(conversationId);
  const stub = env.CHAT_ROOM.get(doId);
  const wsUrl = new URL(request.url);
  wsUrl.searchParams.set('user_id', payload.sub);
  return stub.fetch(new Request(wsUrl.toString(), request));
}
