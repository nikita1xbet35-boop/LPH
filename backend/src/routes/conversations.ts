import type { Env, Conversation, Message, User } from '../types';
import { json, err } from '../lib/cors';
import { requireAuth, AuthError } from '../lib/db';
import { nanoid } from '../lib/nanoid';

export async function handleConversations(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const ctx = await requireAuth(request, env);
    const now = Math.floor(Date.now() / 1000);

    // GET /api/conversations
    if (path === '/api/conversations' && request.method === 'GET') {
      const { results: convs } = await env.DB.prepare(`
        SELECT c.*, cm.joined_at FROM conversations c
        JOIN conversation_members cm ON cm.conversation_id = c.id
        WHERE cm.user_id = ?
        ORDER BY c.created_at DESC
      `).bind(ctx.user.id).all<Conversation & { joined_at: number }>();

      const enriched = await Promise.all(convs.map(async (conv) => {
        const { results: members } = await env.DB.prepare(
          'SELECT u.id, u.username, u.display_name, u.last_seen, u.public_key FROM users u JOIN conversation_members cm ON cm.user_id = u.id WHERE cm.conversation_id = ?'
        ).bind(conv.id).all<Pick<User, 'id' | 'username' | 'display_name' | 'last_seen' | 'public_key'>>();

        const lastMsg = await env.DB.prepare(
          'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1'
        ).bind(conv.id).first<Message>();

        const { results: reads } = await env.DB.prepare(
          'SELECT message_id FROM message_reads WHERE user_id = ?'
        ).bind(ctx.user.id).all<{ message_id: string }>();
        const readSet = new Set(reads.map(r => r.message_id));

        const { results: unreadMsgs } = await env.DB.prepare(
          'SELECT id FROM messages WHERE conversation_id = ? AND sender_id != ?'
        ).bind(conv.id, ctx.user.id).all<{ id: string }>();
        const unread_count = unreadMsgs.filter(m => !readSet.has(m.id)).length;

        return { ...conv, members, last_message: lastMsg ?? null, unread_count };
      }));

      return json(enriched, 200, env, request);
    }

    // POST /api/conversations
    if (path === '/api/conversations' && request.method === 'POST') {
      let body: { type?: string; name?: string; member_ids?: string[] };
      try { body = await request.json(); } catch { return err('bad_request', 'Invalid JSON', 400, env, request); }

      if (!body.type || !['direct', 'group'].includes(body.type)) {
        return err('bad_request', 'type must be direct or group', 400, env, request);
      }
      if (!body.member_ids?.length) {
        return err('bad_request', 'member_ids required', 400, env, request);
      }

      const allMembers = Array.from(new Set([ctx.user.id, ...body.member_ids]));

      // Для direct — проверяем существующий чат
      if (body.type === 'direct' && allMembers.length === 2) {
        const otherId = allMembers.find(id => id !== ctx.user.id)!;
        const existing = await env.DB.prepare(`
          SELECT c.id FROM conversations c
          JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
          JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
          WHERE c.type = 'direct'
          LIMIT 1
        `).bind(ctx.user.id, otherId).first<{ id: string }>();

        if (existing) {
          const conv = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?')
            .bind(existing.id).first<Conversation>();
          return json({ conversation: conv }, 200, env, request);
        }
      }

      const convId = nanoid();
      await env.DB.prepare(
        'INSERT INTO conversations (id, type, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(convId, body.type, body.name ?? null, ctx.user.id, now).run();

      for (const uid of allMembers) {
        await env.DB.prepare(
          'INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
        ).bind(convId, uid, now).run();
      }

      const conv = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?')
        .bind(convId).first<Conversation>();
      return json({ conversation: conv }, 201, env, request);
    }

    // GET /api/conversations/:id
    const matchConv = path.match(/^\/api\/conversations\/([^/]+)$/);
    if (matchConv && request.method === 'GET') {
      const convId = matchConv[1]!;
      const member = await env.DB.prepare(
        'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
      ).bind(convId, ctx.user.id).first();
      if (!member) return err('forbidden', 'Not a member', 403, env, request);

      const conv = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(convId).first<Conversation>();
      if (!conv) return err('not_found', 'Conversation not found', 404, env, request);
      return json({ conversation: conv }, 200, env, request);
    }

    // GET /api/conversations/:id/messages
    const matchMsgs = path.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (matchMsgs && request.method === 'GET') {
      const convId = matchMsgs[1]!;
      const member = await env.DB.prepare(
        'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
      ).bind(convId, ctx.user.id).first();
      if (!member) return err('forbidden', 'Not a member', 403, env, request);

      const url = new URL(request.url);
      const before = url.searchParams.get('before');
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);

      let query: string;
      let params: unknown[];
      if (before) {
        const pivot = await env.DB.prepare('SELECT created_at FROM messages WHERE id = ?').bind(before).first<{ created_at: number }>();
        query = 'SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?';
        params = [convId, pivot?.created_at ?? 0, limit];
      } else {
        query = 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?';
        params = [convId, limit];
      }

      const { results } = await env.DB.prepare(query).bind(...params).all<Message>();
      return json(results, 200, env, request);
    }

    return err('not_found', 'Not found', 404, env, request);
  } catch (e) {
    if (e instanceof AuthError) return err('unauthorized', 'Unauthorized', 401, env, request);
    throw e;
  }
}
