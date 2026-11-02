import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';

// Toda la app exige sesión, salvo /login y las rutas de autenticación.
export async function proxy(req: NextRequest) {
  const ok = await verifySession(process.env.SESSION_SECRET, req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sesión vencida. Vuelve a ingresar.' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
