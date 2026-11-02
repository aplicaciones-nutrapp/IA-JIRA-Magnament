import Anthropic from '@anthropic-ai/sdk';
import { agentTools, systemPrompt } from '@/lib/agent';
import { ConfigError, DEFAULT_MODEL, env } from '@/lib/env';
import { JiraError, getModel } from '@/lib/jira';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_ROUNDS = 8;

interface Turn { role: 'user' | 'assistant'; content: string }

function cleanTurns(v: unknown): Turn[] {
  if (!Array.isArray(v)) return [];
  const turns = v
    .filter((t): t is Turn => !!t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim() !== '')
    .map((t) => ({ role: t.role, content: t.content.slice(0, 20000) }))
    .slice(-12);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  // Une turnos consecutivos del mismo rol (p. ej. una respuesta que falló)
  const out: Turn[] = [];
  for (const t of turns) {
    const prev = out.at(-1);
    if (prev && prev.role === t.role) prev.content += '\n\n' + t.content;
    else out.push({ ...t });
  }
  return out;
}

function errorText(e: unknown) {
  if (e instanceof ConfigError) return `${e.message}. Agrégala en Vercel y vuelve a desplegar.`;
  if (e instanceof JiraError) return `${e.message}${e.detail ? ` (${e.detail})` : ''}`;
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401) return 'La API de Claude rechazó ANTHROPIC_API_KEY.';
    if (e.status === 429) return 'Se alcanzó el límite de uso de la API de Claude. Intenta en un momento.';
    if (e.status === 529 || e.status === 503) return 'La API de Claude está saturada. Intenta en un momento.';
    return `Error de la API de Claude (${e.status}).`;
  }
  return 'La consulta falló por un problema de conexión.';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const turns = cleanTurns(body?.messages);
  if (!turns.length || turns.at(-1)!.role !== 'user') return Response.json({ error: 'Falta la pregunta.' }, { status: 400 });

  const enc = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener('abort', () => abort.abort());

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: object) => { try { ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { /* cliente cerró */ } };
      try {
        const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
        const model = await getModel();
        send({ type: 'meta', ref: model.ref });
        const tools = agentTools(model);
        const messages: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const last = round === MAX_ROUNDS - 1;
          const s = client.messages.stream(
            {
              model: env('ANTHROPIC_MODEL', DEFAULT_MODEL),
              max_tokens: 8000,
              system: systemPrompt(model),
              tools: tools.map((t) => t.def),
              ...(last ? { tool_choice: { type: 'none' as const } } : {}),
              messages,
            },
            { signal: abort.signal },
          );
          s.on('text', (text) => send({ type: 'text', text }));
          const final = await s.finalMessage();
          messages.push({ role: 'assistant', content: final.content });
          if (final.stop_reason !== 'tool_use') {
            if (final.stop_reason === 'max_tokens') send({ type: 'note', text: 'La respuesta se cortó por longitud. Pide una parte más acotada.' });
            break;
          }
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const b of final.content) {
            if (b.type !== 'tool_use') continue;
            send({ type: 'tool', name: b.name });
            const tool = tools.find((t) => t.def.name === b.name);
            try {
              const out = tool ? await tool.run((b.input || {}) as Record<string, unknown>, abort.signal) : 'Herramienta desconocida';
              results.push({ type: 'tool_result', tool_use_id: b.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
            } catch (err) {
              results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: err instanceof JiraError ? `${err.message} ${err.detail || ''}` : err instanceof Error ? err.message : 'Error' });
            }
          }
          messages.push({ role: 'user', content: results });
          send({ type: 'break' });
        }
        send({ type: 'done' });
      } catch (e) {
        if (!abort.signal.aborted) {
          console.error('[agent]', e);
          send({ type: 'error', message: errorText(e) });
        }
      } finally {
        try { ctrl.close(); } catch { /* ya cerrado */ }
      }
    },
    cancel() { abort.abort(); },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
