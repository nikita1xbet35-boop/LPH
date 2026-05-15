import type { Env } from '../types';
import { nanoid } from '../lib/nanoid';
import { requireAuth, AuthError } from '../lib/db';
import { json, err, withCors } from '../lib/cors';

const CONTENT_TYPE_EXT: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export async function handleUpload(request: Request, env: Env, path: string): Promise<Response> {
  try {
    // GET /api/media/:key — serve media file
    // Accepts token via Authorization header OR ?token= query param (for <audio>/<video> src)
    if (path.startsWith('/api/media/')) {
      const url = new URL(request.url);
      const queryToken = url.searchParams.get('token');
      let authedRequest = request;
      if (queryToken && !request.headers.get('Authorization')) {
        const headers = new Headers(request.headers);
        headers.set('Authorization', `Bearer ${queryToken}`);
        authedRequest = new Request(request.url, { ...request, headers });
      }
      const ctx = await requireAuth(authedRequest, env);
      void ctx;

      const key = path.slice('/api/media/'.length);
      if (!key) return withCors(err('bad_request', 'Missing key', 400), env, request);

      const object = await env.MEDIA.get(key);
      if (!object) return withCors(err('not_found', 'Media not found', 404), env, request);

      const contentType = object.httpMetadata?.contentType ?? 'application/octet-stream';
      const headers = new Headers({
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=31536000',
      });

      return withCors(new Response(object.body, { status: 200, headers }), env, request);
    }

    // POST /api/upload — upload a media file
    if (path === '/api/upload' || path.startsWith('/api/upload')) {
      if (request.method !== 'POST') {
        return withCors(err('method_not_allowed', 'Method not allowed', 405), env, request);
      }

      const ctx = await requireAuth(request, env);
      const userId = ctx.user.id;

      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return withCors(err('bad_request', 'Missing file field', 400), env, request);
      }

      const contentType = file.type;
      const ext = CONTENT_TYPE_EXT[contentType];
      if (!ext) {
        return withCors(err('unsupported_media_type', 'Unsupported media type: ' + contentType, 415), env, request);
      }

      const key = `${userId}/${Date.now()}-${nanoid()}.${ext}`;

      await env.MEDIA.put(key, file.stream(), {
        httpMetadata: { contentType },
      });

      return withCors(
        json({ key, url: '/api/media/' + key }, 201),
        env,
        request,
      );
    }

    return withCors(err('not_found', 'Not found', 404), env, request);
  } catch (e) {
    if (e instanceof AuthError) {
      return withCors(err('unauthorized', 'Unauthorized', 401), env, request);
    }
    throw e;
  }
}
