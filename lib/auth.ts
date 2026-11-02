// Sesión firmada con HMAC-SHA256 (Web Crypto: funciona en proxy y en rutas).
export const SESSION_COOKIE = 'di_session';
export const SESSION_DAYS = 7;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer) {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Compara dos secretos sin filtrar su longitud ni su contenido por tiempo. */
export async function safeEqual(secret: string, a: string, b: string) {
  const [x, y] = await Promise.all([hmac(secret, 'cmp:' + a), hmac(secret, 'cmp:' + b)]);
  return sameString(x, y);
}

export async function createSession(secret: string) {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return `${exp}.${await hmac(secret, 'session:' + exp)}`;
}

export async function verifySession(secret: string | undefined, token: string | undefined) {
  if (!secret || !token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return sameString(await hmac(secret, 'session:' + exp), sig);
}
