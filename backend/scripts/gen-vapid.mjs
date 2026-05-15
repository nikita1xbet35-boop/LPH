#!/usr/bin/env node
// Run: node backend/scripts/gen-vapid.mjs
// Requires Node.js >= 18
import crypto from 'crypto';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privJwk = privateKey.export({ format: 'jwk' });
const pubJwk = publicKey.export({ format: 'jwk' });

const x = Buffer.from(pubJwk.x, 'base64url');
const y = Buffer.from(pubJwk.y, 'base64url');
const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]);

console.log('\nAdd to wrangler.toml [vars]:');
console.log(`VAPID_PUBLIC_KEY = "${uncompressed.toString('base64url')}"`);
console.log(`VAPID_PRIVATE_KEY_JWK = '${JSON.stringify(privJwk)}'`);
console.log(`VAPID_CONTACT = "mailto:admin@example.com"`);
