import { storage } from './storage.js';

const BASE = '/api';

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

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};
