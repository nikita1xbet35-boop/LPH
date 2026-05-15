import type { Env, Message } from '../types';
import { json, err } from '../lib/cors';
import { requireAuth, AuthError } from '../lib/db';
import { nanoid } from '../lib/nanoid';
import { sendWebPush, type PushSubscriptionRecord } from '../lib/webpush';

export async function handleMessages(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const ctx = await requireAuth(request, env);
    const now = Math.floor(Date.now() / 1000);

    // POST /api/conversations/:id/messages
    const matchPost = path.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (matchPost && request.method === 'POST') {
      const convId = matchPost[1]!;
      const member = await env.DB.prepare(
        'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
      ).bind(convId, ctx.user.id).first();
      if (!member) return err('forbidden', 'Not a member', 403, env, request);

      let body: { content?: string; nonce?: string };
      try { body = await request.json(); } catch { return err('bad_request', 'Invalid JSON', 400, env, request); }
      if (!body.content?.trim()) return err('bad_request', 'content required', 400, env, request);

      const msgId = nanoid();
      await env.DB.prepare(
        'INSERT INTO messages (id, conversation_id, sender_id, content, nonce, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(msgId, convId, ctx.user.id, body.content, body.nonce ?? null, now).run();

      const message = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(msgId).first<Message>();

      // Broadcast через Durable Object
      try {
        const doId = env.CHAT_ROOM.idFromName(convId);
        const stub = env.CHAT_ROOM.get(doId);
        await stub.fetch('https://internal/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'message:new', data: { message }, excludeUserId: ctx.user.id }),
        });
      } catch (e) {
        console.error('Broadcast error:', e);
      }

      // Push notifications to offline members
      if (env.VAPID_PRIVATE_KEY_JWK && env.VAPID_CONTACT) {
        try {
          const members = await env.DB.prepare(
            'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?'
          ).bind(convId, ctx.user.id).all<{ user_id: string }>();

          const senderName = ctx.user.display_name || ctx.user.username;
          const preview = body.content?.startsWith('{"t":"audio"') ? '🎤 Voice message'
            : body.content?.startsWith('{"t":"video"') ? '🎥 Video circle'
            : body.nonce ? '🔒 Encrypted message'
            : (body.content ?? '').substring(0, 80);

          const pushPromises: Promise<void>[] = [];
          for (const { user_id } of members.results) {
            const subs = await env.DB.prepare(
              'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?'
            ).bind(user_id).all<PushSubscriptionRecord>().catch(() => ({ results: [] }));

            for (const sub of subs.results) {
              pushPromises.push(
                sendWebPush(sub, { title: senderName, body: preview, url: '/#/chat' },
                  env.VAPID_PRIVATE_KEY_JWK!, env.VAPID_CONTACT!).catch(() => {})
              );
            }
          }
          await Promise.allSettled(pushPromises);
        } catch {}
      }

      return json({ message }, 201, env, request);
    }

    // DELETE /api/messages/:id
    const matchDelete = path.match(/^\/api\/messages\/([^/]+)$/);
    if (matchDelete && request.method === 'DELETE') {
      const msgId = matchDelete[1]!;
      const msg = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(msgId).first<Message>();
      if (!msg) return err('not_found', 'Message not found', 404, env, request);
      if (msg.sender_id !== ctx.user.id) return err('forbidden', 'Not your message', 403, env, request);

      await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(msgId).run();

      // Broadcast удаление
      try {
        const doId = env.CHAT_ROOM.idFromName(msg.conversation_id);
        const stub = env.CHAT_ROOM.get(doId);
        await stub.fetch('https://internal/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'message:deleted', data: { id: msgId } }),
        });
      } catch (e) {
        console.error('Broadcast error:', e);
      }

      return json({ ok: true }, 200, env, request);
    }

    // POST /api/messages/:id/read
    const matchRead = path.match(/^\/api\/messages\/([^/]+)\/read$/);
    if (matchRead && request.method === 'POST') {
      const msgId = matchRead[1]!;
      const msg = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(msgId).first<Message>();
      if (!msg) return err('not_found', 'Message not found', 404, env, request);

      const member = await env.DB.prepare(
        'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
      ).bind(msg.conversation_id, ctx.user.id).first();
      if (!member) return err('forbidden', 'Not a member', 403, env, request);

      await env.DB.prepare(
        'INSERT OR IGNORE INTO message_reads (message_id, user_id, read_at) VALUES (?, ?, ?)'
      ).bind(msgId, ctx.user.id, now).run();

      // Broadcast статус прочтения
      try {
        const doId = env.CHAT_ROOM.idFromName(msg.conversation_id);
        const stub = env.CHAT_ROOM.get(doId);
        await stub.fetch('https://internal/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'message:read', data: { message_id: msgId, user_id: ctx.user.id } }),
        });
      } catch (e) {
        console.error('Broadcast error:', e);
      }

      return json({ ok: true }, 200, env, request);
    }

    return err('not_found', 'Not found', 404, env, request);
  } catch (e) {
    if (e instanceof AuthError) return err('unauthorized', 'Unauthorized', 401, env, request);
    throw e;
  }
}
