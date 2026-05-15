import type { Env } from '../types';

export function getAllowedOrigin(env: Env, request: Request): string {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGIN ?? 'http://localhost:5173';
  if (origin === allowed || origin === 'http://localhost:5173') return origin;
  return allowed;
}

export function corsHeaders(env: Env, request: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(env, request),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function handleOptions(env: Env, request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env, request) });
}

export function withCors(response: Response, env: Env, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(env, request))) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

export function json(data: unknown, status = 200, env?: Env, request?: Request): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env && request) Object.assign(headers, corsHeaders(env, request));
  return new Response(JSON.stringify(data), { status, headers });
}

export function err(code: string, message: string, status: number, env?: Env, request?: Request): Response {
  return json({ error: code, message }, status, env, request);
}
