import type { JWTPayload } from '../types';

const EXP_30_DAYS = 30 * 24 * 60 * 60;

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  );
}

export async function signJWT(secret: string, payload: Omit<JWTPayload, 'exp'>): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + EXP_30_DAYS;
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, exp })));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig as ArrayBuffer)}`;
}

export async function verifyJWT(secret: string, token: string): Promise<JWTPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC', key,
    b64urlDecode(sig).buffer as ArrayBuffer,
    new TextEncoder().encode(`${header}.${body}`)
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as JWTPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
