const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function nanoid(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let id = '';
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i]! & 63];
  return id;
}
