const CURVE = { name: 'ECDH', namedCurve: 'P-256' };

// --- Key generation & storage ---

export async function generateKeyPair() {
  return crypto.subtle.generateKey(CURVE, true, ['deriveKey']);
}

export async function exportPublicKey(key) {
  const raw = await crypto.subtle.exportKey('spki', key);
  return b64(new Uint8Array(raw));
}

export async function exportPrivateKey(key) {
  const raw = await crypto.subtle.exportKey('pkcs8', key);
  return b64(new Uint8Array(raw));
}

export async function importPublicKey(b64str) {
  const raw = unb64(b64str);
  return crypto.subtle.importKey('spki', raw, CURVE, true, []);
}

export async function importPrivateKey(b64str) {
  const raw = unb64(b64str);
  return crypto.subtle.importKey('pkcs8', raw, CURVE, true, ['deriveKey']);
}

// public_key field in DB stores: "pubKeyB64||iv.encryptedPrivB64"
// This lets us store the encrypted private key without a schema change.
export function packKeyField(pubB64, encB64) {
  return encB64 ? `${pubB64}||${encB64}` : pubB64;
}
export function unpackKeyField(value) {
  if (!value) return { pub: null, enc: null };
  const idx = value.indexOf('||');
  if (idx === -1) return { pub: value, enc: null };
  return { pub: value.slice(0, idx), enc: value.slice(idx + 2) };
}

// Import only the public part of a (possibly packed) key field
export async function importPublicKeyField(keyField) {
  const { pub } = unpackKeyField(keyField);
  if (!pub) return null;
  return importPublicKey(pub);
}

// --- KEK: password-derived key used to encrypt the ECDH private key ---

export async function deriveKEK(password, userId) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(`e2e:${userId}`), iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

async function encryptPrivateKey(privateKey, kek) {
  const raw = await crypto.subtle.exportKey('pkcs8', privateKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, raw);
  return b64(iv) + '.' + b64(new Uint8Array(ct));
}

async function decryptPrivateKey(encrypted, kek) {
  const [ivB64, ctB64] = encrypted.split('.');
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(ivB64) },
    kek,
    unb64(ctB64)
  );
  return crypto.subtle.importKey('pkcs8', raw, CURVE, true, ['deriveKey']);
}

// --- Load or create key pair ---
// Encrypted private key is stored packed into the public_key field ("pub||enc")
// so no DB migration is needed.

export async function loadOrCreateKeyPair(userId, user, kek, patchFn) {
  const { pub: serverPub, enc: serverEnc } = unpackKeyField(user?.public_key);

  // 1. Restore from server-stored encrypted private key (works cross-device)
  if (serverEnc && serverPub && kek) {
    try {
      const privateKey = await decryptPrivateKey(serverEnc, kek);
      const publicKey = await importPublicKey(serverPub);
      const privB64 = await exportPrivateKey(privateKey);
      localStorage.setItem(`e2e_pub_${userId}`, serverPub);
      localStorage.setItem(`e2e_priv_${userId}`, privB64);
      return { publicKey, privateKey, publicKeyB64: serverPub, isNew: false };
    } catch {}
  }

  // 2. Same browser — restore from localStorage
  const storedPub = localStorage.getItem(`e2e_pub_${userId}`);
  const storedPriv = localStorage.getItem(`e2e_priv_${userId}`);
  if (storedPub && storedPriv) {
    try {
      const publicKey = await importPublicKey(storedPub);
      const privateKey = await importPrivateKey(storedPriv);
      // Upload encrypted backup if we have KEK and server doesn't have enc yet
      if (kek && !serverEnc) {
        const enc = await encryptPrivateKey(privateKey, kek);
        patchFn?.({ public_key: packKeyField(storedPub, enc) });
      }
      return { publicKey, privateKey, publicKeyB64: storedPub, isNew: false };
    } catch {}
  }

  // 3. Fresh key pair
  const pair = await generateKeyPair();
  const publicKeyB64 = await exportPublicKey(pair.publicKey);
  const privateKeyB64 = await exportPrivateKey(pair.privateKey);
  localStorage.setItem(`e2e_pub_${userId}`, publicKeyB64);
  localStorage.setItem(`e2e_priv_${userId}`, privateKeyB64);

  let packedPub = publicKeyB64;
  if (kek) {
    const enc = await encryptPrivateKey(pair.privateKey, kek);
    packedPub = packKeyField(publicKeyB64, enc);
  }
  patchFn?.({ public_key: packedPub });

  return { ...pair, publicKeyB64, isNew: true };
}

// --- Encryption / Decryption ---

async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(content, myPrivateKey, theirPublicKey) {
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(content);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    sharedKey,
    encoded
  );
  return {
    content: b64(new Uint8Array(ciphertext)),
    nonce: b64(nonce),
  };
}

export async function decryptMessage(ciphertext, nonce, myPrivateKey, theirPublicKey) {
  try {
    const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(nonce) },
      sharedKey,
      unb64(ciphertext)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

// --- Helpers ---

function b64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function unb64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}
