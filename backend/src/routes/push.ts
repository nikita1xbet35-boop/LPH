import type { Env } from '../types';
import { json, err } from '../lib/cors';
import { requireAuth, AuthError } from '../lib/db';
import { nanoid } from '../lib/nanoid';

interface SubBody {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
}

export async function handlePush(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const ctx = await requireAuth(request, env);
    const now = Math.floor(Date.now() / 1000);

    // GET /api/push/vapid-public-key
    if (path === '/api/push/vapid-public-key' && request.method === 'GET') {
      return json({ key: env.VAPID_PUBLIC_KEY ?? '' }, 200, env, request);
    }

    // POST /api/push/subscribe
    if (path === '/api/push/subscribe' && request.method === 'POST') {
      let body: SubBody;
      try { body = await request.json(); } catch { return err('bad_request', 'Invalid JSON', 400, env, request); }

      const { endpoint, keys } = body.subscription ?? {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) return err('bad_request', 'Invalid subscription', 400, env, request);

      // Ensure table exists (idempotent)
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL
      )`);

      // Upsert by endpoint
      const existing = await env.DB.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).first<{ id: string }>();
      if (existing) {
        await env.DB.prepare('UPDATE push_subscriptions SET user_id=?,p256dh=?,auth=?,created_at=? WHERE id=?')
          .bind(ctx.user.id, keys.p256dh, keys.auth, now, existing.id).run();
      } else {
        await env.DB.prepare('INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?,?)')
          .bind(nanoid(), ctx.user.id, endpoint, keys.p256dh, keys.auth, now).run();
      }

      return json({ ok: true }, 200, env, request);
    }

    // DELETE /api/push/subscribe
    if (path === '/api/push/subscribe' && request.method === 'DELETE') {
      let body: { endpoint: string };
      try { body = await request.json(); } catch { return err('bad_request', 'Invalid JSON', 400, env, request); }
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(body.endpoint, ctx.user.id).run();
      return json({ ok: true }, 200, env, request);
    }

    return err('not_found', 'Not found', 404, env, request);
  } catch (e) {
    if (e instanceof AuthError) return err('unauthorized', 'Unauthorized', 401, env, request);
    throw e;
  }
}
