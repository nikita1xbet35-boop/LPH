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

export async function loadOrCreateKeyPair(userId) {
  const storedPub = localStorage.getItem(`e2e_pub_${userId}`);
  const storedPriv = localStorage.getItem(`e2e_priv_${userId}`);

  if (storedPub && storedPriv) {
    try {
      const publicKey = await importPublicKey(storedPub);
      const privateKey = await importPrivateKey(storedPriv);
      return { publicKey, privateKey, publicKeyB64: storedPub, isNew: false };
    } catch {}
  }

  const pair = await generateKeyPair();
  const publicKeyB64 = await exportPublicKey(pair.publicKey);
  const privateKeyB64 = await exportPrivateKey(pair.privateKey);
  localStorage.setItem(`e2e_pub_${userId}`, publicKeyB64);
  localStorage.setItem(`e2e_priv_${userId}`, privateKeyB64);
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
    return '[не удалось расшифровать]';
  }
}

// --- Helpers ---

function b64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function unb64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}
