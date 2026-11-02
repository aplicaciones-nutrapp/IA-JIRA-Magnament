import { NextResponse } from 'next/server';
import { ConfigError } from '@/lib/env';
import { JiraError, getModel } from '@/lib/jira';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  try {
    const model = await getModel(force);
    return NextResponse.json(model, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ConfigError) return NextResponse.json({ error: e.message, detail: 'Agrégala en Vercel → Settings → Environment Variables y vuelve a desplegar.' }, { status: 500 });
    if (e instanceof JiraError) return NextResponse.json({ error: e.message, detail: e.detail }, { status: 502 });
    console.error('[jira/sync]', e);
    return NextResponse.json({ error: 'No se pudo conectar con Jira.', detail: e instanceof Error ? e.message : undefined }, { status: 502 });
  }
}
