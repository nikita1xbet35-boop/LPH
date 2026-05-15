import { storage } from './storage.js';

const BASE = (import.meta.env.VITE_API_BASE || '') + '/api';

async function request(method, path, body) {
  const token = storage.get('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'unknown', message: res.statusText }));
    const err = new Error(data.message || 'Request failed');
    err.code = data.error;
    err.status = res.status;
    throw err;
  }

  return res.json();
}

async function uploadFile(path, formData) {
  const token = storage.get('token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method: 'POST', headers, body: formData });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Upload failed');
  }
  return res.json();
}

// For <audio>/<video> src — append token as query param
export function mediaUrl(url) {
  const token = storage.get('token');
  return `${BASE}${url}?token=${encodeURIComponent(token || '')}`;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  upload: (formData) => uploadFile('/upload', formData),
};

