import { NextResponse } from 'next/server';
import { ConfigError } from '@/lib/env';
import { GroupError, JiraError, getModel } from '@/lib/jira';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ?force=1 vuelve a consultar Jira · ?group=Nombre filtra por grupo · ?group=* todos los responsables
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  try {
    const model = await getModel(sp.get('force') === '1', sp.get('group'));
    return NextResponse.json(model, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof GroupError) return NextResponse.json({ error: e.message, code: 'unknown_group' }, { status: 400 });
    if (e instanceof ConfigError) return NextResponse.json({ error: e.message, detail: 'Agrégala en Vercel → Settings → Environment Variables y vuelve a desplegar.' }, { status: 500 });
    if (e instanceof JiraError) return NextResponse.json({ error: e.message, detail: e.detail }, { status: 502 });
    console.error('[jira/sync]', e);
    return NextResponse.json({ error: 'No se pudo conectar con Jira.', detail: e instanceof Error ? e.message : undefined }, { status: 502 });
  }
}
