import type { Env } from '../types';
import { json, err } from '../lib/cors';
import { hashPassword } from '../lib/password';
import { nanoid } from '../lib/nanoid';

// Одноразовый endpoint — работает только если в базе нет ни одного юзера
export async function handleSetup(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return err('method_not_allowed', 'POST only', 405, env, request);

  const count = await env.DB.prepare('SELECT COUNT(*) as n FROM users').first<{ n: number }>();
  if (count && count.n > 0) {
    return err('forbidden', 'Already initialized', 403, env, request);
  }

  let body: { password?: string };
  try { body = await request.json(); } catch { return err('bad_request', 'Invalid JSON', 400, env, request); }
  if (!body.password) return err('bad_request', 'password required', 400, env, request);

  const id = nanoid();
  const hash = await hashPassword(body.password);
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, 'admin', hash, 'Admin', now).run();

  return json({ ok: true, message: 'Admin created' }, 201, env, request);
}
