import type { Env } from '../types';
import { json, err } from '../lib/cors';
import { verifyPassword } from '../lib/password';
import { signJWT } from '../lib/jwt';
import { nanoid } from '../lib/nanoid';
import { requireAuth, AuthError } from '../lib/db';
import type { User } from '../types';

export async function handleAuth(request: Request, env: Env, path: string): Promise<Response> {
  if (path === '/api/auth/login' && request.method === 'POST') {
    return login(request, env);
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    return logout(request, env);
  }
  if (path === '/api/auth/me' && request.method === 'GET') {
    return me(request, env);
  }
  return err('not_found', 'Not found', 404, env, request);
}

async function login(request: Request, env: Env): Promise<Response> {
  let body: { username?: string; password?: string };
  try { body = await request.json(); } catch { return err('bad_request', 'Invalid JSON', 400, env, request); }

  if (!body.username || !body.password) {
    return err('bad_request', 'username and password required', 400, env, request);
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?')
    .bind(body.username).first<User>();

  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    return err('invalid_credentials', 'Invalid username or password', 401, env, request);
  }

  const tokenId = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 30 * 24 * 60 * 60;

  await env.DB.prepare(
    'INSERT INTO sessions (token_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(tokenId, user.id, now, expiresAt).run();

  const token = await signJWT(env.JWT_SECRET, { sub: user.id, jti: tokenId });

  return json({
    token,
    user: { id: user.id, username: user.username, display_name: user.display_name, public_key: user.public_key, encrypted_private_key: user.encrypted_private_key ?? null },
  }, 200, env, request);
}

async function logout(request: Request, env: Env): Promise<Response> {
  try {
    const ctx = await requireAuth(request, env);
    await env.DB.prepare('DELETE FROM sessions WHERE token_id = ?').bind(ctx.tokenId).run();
    return json({ ok: true }, 200, env, request);
  } catch (e) {
    if (e instanceof AuthError) return err('unauthorized', 'Unauthorized', 401, env, request);
    throw e;
  }
}

async function me(request: Request, env: Env): Promise<Response> {
  try {
    const ctx = await requireAuth(request, env);
    const { user } = ctx;
    return json({
      user: { id: user.id, username: user.username, display_name: user.display_name, last_seen: user.last_seen, public_key: user.public_key, encrypted_private_key: user.encrypted_private_key ?? null },
    }, 200, env, request);
  } catch (e) {
    if (e instanceof AuthError) return err('unauthorized', 'Unauthorized', 401, env, request);
    throw e;
  }
}
