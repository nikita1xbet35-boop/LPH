import type { Env, User } from '../types';
import { json, err } from '../lib/cors';
import { requireAuth, AuthError } from '../lib/db';

export async function handleUsers(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const ctx = await requireAuth(request, env);

    if (path === '/api/users' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, username, display_name, last_seen, public_key FROM users WHERE id != ?'
      ).bind(ctx.user.id).all<Pick<User, 'id' | 'username' | 'display_name' | 'last_seen' | 'public_key'>>();
      return json(results, 200, env, request);
    }

    if (path === '/api/users/me' && request.method === 'PATCH') {
      let body: { display_name?: string; public_key?: string; encrypted_private_key?: string };
      try { body = await request.json(); } catch { return err('bad_request', 'Invalid JSON', 400, env, request); }

      if (body.display_name !== undefined) {
        await env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?')
          .bind(body.display_name, ctx.user.id).run();
      }
      if (body.public_key !== undefined) {
        await env.DB.prepare('UPDATE users SET public_key = ? WHERE id = ?')
          .bind(body.public_key, ctx.user.id).run();
      }
      if (body.encrypted_private_key !== undefined) {
        await env.DB.prepare('UPDATE users SET encrypted_private_key = ? WHERE id = ?')
          .bind(body.encrypted_private_key, ctx.user.id).run();
      }

      const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(ctx.user.id).first<User>();
      return json({ user: updated }, 200, env, request);
    }

    // DELETE /api/users/me/messages — wipe all messages sent by this user
    if (path === '/api/users/me/messages' && request.method === 'DELETE') {
      const convRows = await env.DB.prepare(
        'SELECT DISTINCT conversation_id FROM messages WHERE sender_id = ?'
      ).bind(ctx.user.id).all<{ conversation_id: string }>();

      await env.DB.prepare('DELETE FROM messages WHERE sender_id = ?').bind(ctx.user.id).run();

      for (const row of convRows.results) {
        try {
          const doId = env.CHAT_ROOM.idFromName(row.conversation_id);
          const stub = env.CHAT_ROOM.get(doId);
          await stub.fetch('https://internal/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'messages:purged', data: { user_id: ctx.user.id, conversation_id: row.conversation_id } }),
          });
        } catch {}
      }

      return json({ ok: true }, 200, env, request);
    }

    return err('not_found', 'Not found', 404, env, request);
  } catch (e) {
    if (e instanceof AuthError) return err('unauthorized', 'Unauthorized', 401, env, request);
    throw e;
  }
}
