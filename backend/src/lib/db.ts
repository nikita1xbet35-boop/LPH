import type { Env, AuthContext, User } from '../types';
import { verifyJWT } from './jwt';

export async function getAuthContext(request: Request, env: Env): Promise<AuthContext | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const payload = await verifyJWT(env.JWT_SECRET, token);
  if (!payload) return null;

  const session = await env.DB.prepare(
    'SELECT * FROM sessions WHERE token_id = ? AND expires_at > ?'
  ).bind(payload.jti, Math.floor(Date.now() / 1000)).first();
  if (!session) return null;

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first<User>();
  if (!user) return null;

  await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?')
    .bind(Math.floor(Date.now() / 1000), user.id).run();

  return { user, tokenId: payload.jti };
}

export async function requireAuth(request: Request, env: Env): Promise<AuthContext> {
  const ctx = await getAuthContext(request, env);
  if (!ctx) throw new AuthError();
  return ctx;
}

export class AuthError extends Error {
  constructor() { super('unauthorized'); }
}

export function requireAdmin(ctx: AuthContext, env: Env): void {
  if (ctx.user.username !== env.ADMIN_USERNAME) throw new ForbiddenError();
}

export class ForbiddenError extends Error {
  constructor() { super('forbidden'); }
}
