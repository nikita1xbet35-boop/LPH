// Web Push (RFC 8291) + VAPID (RFC 8292) for Cloudflare Workers Web Crypto API

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function b64uDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - s.length % 4) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function b64uEncode(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', salt.length ? salt : new Uint8Array(32),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const n = Math.ceil(length / 32);
  const out = new Uint8Array(n * 32);
  let prev = new Uint8Array(0);
  for (let i = 0; i < n; i++) {
    prev = new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(prev, info, new Uint8Array([i + 1]))));
    out.set(prev, i * 32);
  }
  return out.subarray(0, length);
}

async function encryptPayload(plaintext: Uint8Array, auth: Uint8Array, p256dh: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();

  // Ephemeral server ECDH key pair
  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey)); // 65 bytes

  // Import client's public key
  const uaKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  // ECDH shared secret
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256));

  // PRK_key = HKDF-Extract(auth, ecdhSecret)
  const prkKey = await hkdfExtract(auth, ecdhSecret);

  // IKM = HKDF-Expand(PRK_key, "WebPush: info\x00" || ua_public || as_public, 32)
  const keyInfo = concat(enc.encode('WebPush: info\x00'), p256dh, asPublic);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  // Random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK = HKDF-Extract(salt, IKM)
  const prk = await hkdfExtract(salt, ikm);

  // CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\x00", 16)
  const cek = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\x00'), 16);

  // NONCE = HKDF-Expand(PRK, "Content-Encoding: nonce\x00", 12)
  const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\x00'), 12);

  // AES-128-GCM encrypt (append 0x02 delimiter for last/only record)
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    aesKey,
    concat(plaintext, new Uint8Array([0x02]))
  ));

  // Body: salt(16) || rs(uint32-BE=4096) || idlen(1) || keyid(asPublic) || ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

async function vapidJWT(endpoint: string, privateKeyJWK: string, contact: string): Promise<{ jwt: string; publicKey: string }> {
  const jwk = JSON.parse(privateKeyJWK) as JsonWebKey;
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  // Reconstruct public key bytes from JWK x/y coords
  const x = b64uDecode(jwk.x!);
  const y = b64uDecode(jwk.y!);
  const publicKeyBytes = concat(new Uint8Array([0x04]), x, y);

  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();

  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64uEncode(enc.encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: contact })));
  const signingInput = `${header}.${payload}`;

  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    enc.encode(signingInput)
  ));

  return { jwt: `${signingInput}.${b64uEncode(sig)}`, publicKey: b64uEncode(publicKeyBytes) };
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendWebPush(
  sub: PushSubscriptionRecord,
  payload: { title: string; body?: string; url?: string },
  vapidPrivateKeyJWK: string,
  vapidContact: string,
): Promise<void> {
  const body = await encryptPayload(
    new TextEncoder().encode(JSON.stringify(payload)),
    b64uDecode(sub.auth),
    b64uDecode(sub.p256dh),
  );
  const { jwt, publicKey } = await vapidJWT(sub.endpoint, vapidPrivateKeyJWK, vapidContact);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
    },
    body,
  });

  if (res.status !== 201 && res.status !== 200 && res.status !== 202) {
    console.error('Push send failed:', res.status, await res.text().catch(() => ''));
  }
}
