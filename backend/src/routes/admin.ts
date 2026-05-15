import type { Env, User } from '../types';
import { json, err } from '../lib/cors';
import { requireAuth, requireAdmin, AuthError, ForbiddenError } from '../lib/db';
import { hashPassword } from '../lib/password';
import { nanoid } from '../lib/nanoid';

export async function handleAdmin(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const ctx = await requireAuth(request, env);
    requireAdmin(ctx, env);
    const now = Math.floor(Date.now() / 1000);

    // POST /api/admin/users — создать юзера
    if (path === '/api/admin/users' && request.method === 'POST') {
      let body: { username?: string; password?: string; display_name?: string };
      try { body = await request.json(); } catch { return err('bad_request', 'Invalid JSON', 400, env, request); }
      if (!body.username || !body.password) {
        return err('bad_request', 'username and password required', 400, env, request);
      }

      const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(body.username).first();
      if (existing) return err('conflict', 'Username already taken', 409, env, request);

      const id = nanoid();
      const hash = await hashPassword(body.password);
      await env.DB.prepare(
        'INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, body.username, hash, body.display_name ?? null, now).run();

      const user = await env.DB.prepare('SELECT id, username, display_name, created_at, last_seen FROM users WHERE id = ?')
        .bind(id).first();
      return json({ user }, 201, env, request);
    }

    // GET /api/admin/users
    if (path === '/api/admin/users' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, username, display_name, created_at, last_seen FROM users ORDER BY created_at DESC'
      ).all();
      return json(results, 200, env, request);
    }

    // DELETE /api/admin/users/:id
    const matchDelete = path.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (matchDelete && request.method === 'DELETE') {
      const userId = matchDelete[1]!;
      if (userId === ctx.user.id) return err('bad_request', 'Cannot delete yourself', 400, env, request);
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
      return json({ ok: true }, 200, env, request);
    }

    // POST /api/admin/users/:id/reset-password
    const matchReset = path.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
    if (matchReset && request.method === 'POST') {
      const userId = matchReset[1]!;
      let body: { new_password?: string };
      try { body = await request.json(); } catch { return err('bad_request', 'Invalid JSON', 400, env, request); }
      if (!body.new_password) return err('bad_request', 'new_password required', 400, env, request);

      const hash = await hashPassword(body.new_password);
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, userId).run();
      // Сбрасываем все сессии пользователя
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
      return json({ ok: true }, 200, env, request);
    }

    return err('not_found', 'Not found', 404, env, request);
  } catch (e) {
    if (e instanceof AuthError) return err('unauthorized', 'Unauthorized', 401, env, request);
    if (e instanceof ForbiddenError) return err('forbidden', 'Forbidden', 403, env, request);
    throw e;
  }
}
