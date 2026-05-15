import type { Env, User } from '../types';
import { json, err } from '../lib/cors';
import { requireAuth, AuthError } from '../lib/db';

export async function handleUsers(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const ctx = await requireAuth(request, env);

    if (path === '/api/users' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, username, display_name, last_seen FROM users WHERE id != ?'
      ).bind(ctx.user.id).all<Pick<User, 'id' | 'username' | 'display_name' | 'last_seen'>>();
      return json(results, 200, env, request);
    }

    if (path === '/api/users/me' && request.method === 'PATCH') {
      let body: { display_name?: string; public_key?: string };
      try { body = await request.json(); } catch { return err('bad_request', 'Invalid JSON', 400, env, request); }

      if (body.display_name !== undefined) {
        await env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?')
          .bind(body.display_name, ctx.user.id).run();
      }
      if (body.public_key !== undefined) {
        await env.DB.prepare('UPDATE users SET public_key = ? WHERE id = ?')
          .bind(body.public_key, ctx.user.id).run();
      }

      const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(ctx.user.id).first<User>();
      return json({ user: updated }, 200, env, request);
    }

    return err('not_found', 'Not found', 404, env, request);
  } catch (e) {
    if (e instanceof AuthError) return err('unauthorized', 'Unauthorized', 401, env, request);
    throw e;
  }
}
