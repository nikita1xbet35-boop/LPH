import { createHash, randomBytes } from 'crypto';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// hash-wasm находится в корневом node_modules workspace
const require = createRequire(resolve(__dirname, '../../node_modules/hash-wasm/package.json'));

async function main() {
  const password = process.env.ADMIN_PASSWORD || process.argv[2];
  if (!password) {
    console.error('Usage: ADMIN_PASSWORD=xxx node create-admin.mjs');
    process.exit(1);
  }

  const { argon2id } = await import('../../node_modules/hash-wasm/dist/index.js');

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
  const hashB64 = Buffer.from(hash).toString('base64');
  const stored = `argon2id$${saltB64}$${hashB64}`;
  const id = randomBytes(10).toString('hex');
  const now = Math.floor(Date.now() / 1000);

  const sql = `INSERT OR IGNORE INTO users (id, username, password_hash, display_name, created_at) VALUES ('${id}', 'admin', '${stored}', 'Admin', ${now});`;

  console.log('Creating admin user...');
  execSync(`npx wrangler d1 execute messenger --remote --command="${sql}"`, {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
  });
  console.log('✓ Admin created (username: admin)');
}

main().catch(e => { console.error(e); process.exit(1); });
