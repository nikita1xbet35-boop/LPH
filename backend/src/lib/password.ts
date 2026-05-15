import { argon2id } from 'hash-wasm';

const PARAMS = { iterations: 3, parallelism: 1, memorySize: 19456, hashLength: 32 };

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await argon2id({ password, salt, ...PARAMS, outputType: 'binary' });
  return `argon2id$${toB64(salt)}$${toB64(hash as Uint8Array)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'argon2id') return false;
  const salt = fromB64(parts[1]!);
  const expected = parts[2]!;
  const hash = await argon2id({ password, salt, ...PARAMS, outputType: 'binary' });
  return toB64(hash as Uint8Array) === expected;
}
