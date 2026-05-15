import { execSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';

// Простая реализация argon2id через нативный Node.js для скрипта
// В Worker используется hash-wasm, здесь — для CLI
async function hashPassword(password: string): Promise<string> {
  const { argon2id } = await import('hash-wasm');
  const salt = randomBytes(16);
  const hash = await argon2id({
    password,
    salt,
    iterations: 3,
    parallelism: 1,
    memorySize: 19456,
    hashLength: 32,
    outputType: 'binary',
  });
  const saltB64 = salt.toString('base64');
  const hashB64 = Buffer.from(hash as Uint8Array).toString('base64');
  return `argon2id$${saltB64}$${hashB64}`;
}

function nanoid(size = 21): string {
  const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i]! & 63];
  return id;
}

async function main(): Promise<void> {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: npm run admin:create -w backend -- <password>');
    process.exit(1);
  }

  const id = nanoid();
  const hash = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);

  const sql = `INSERT OR REPLACE INTO users (id, username, password_hash, display_name, created_at) VALUES ('${id}', 'admin', '${hash}', 'Admin', ${now});`;

  try {
    execSync(`wrangler d1 execute messenger --local --command="${sql}"`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    console.log(`✓ Admin created with username: admin`);
  } catch {
    console.error('Failed to create admin. Make sure wrangler is set up and D1 is initialized.');
    process.exit(1);
  }
}

main();
