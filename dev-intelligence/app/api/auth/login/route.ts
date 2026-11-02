import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_DAYS, createSession, safeEqual } from '@/lib/auth';

export async function POST(req: Request) {
  const expected = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expected || !secret || secret.length < 32) {
    return NextResponse.json({ error: 'Falta configurar APP_PASSWORD y SESSION_SECRET (32+ caracteres) en Vercel.' }, { status: 500 });
  }
  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!(await safeEqual(secret, password, expected))) {
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(secret), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
