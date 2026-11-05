'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Msg { role: 'user' | 'assistant'; content: string; status?: string; error?: string; done?: boolean }

const SUGGEST = [
  '¿Cómo está el equipo de desarrollo actualmente?',
  '¿Qué tareas están bloqueadas?',
  '¿Qué desarrolladores tienen más carga de trabajo?',
  '¿Qué tareas llevan más de cinco días en progreso?',
  '¿Qué se desplegó esta semana en producción?',
  '¿Qué issues están pendientes de QA?',
  '¿Cuáles son los principales riesgos del sprint actual?',
  '¿Cuáles fueron los últimos comentarios de los desarrolladores?',
];
const REPORT_Q = 'Genera un informe ejecutivo de la evolución del equipo durante el último mes: KPIs, cumplimiento de sprint, distribución de carga, bloqueos recurrentes, tiempos de resolución, despliegues a producción, riesgos y recomendaciones de acción.';
const TOOL_LABEL: Record<string, string> = {
  buscar_issues: 'Buscando issues', detalle_issue: 'Leyendo el issue', metricas_equipo: 'Calculando métricas', stoppers: 'Revisando stoppers',
  despliegues: 'Revisando despliegues', comentarios: 'Leyendo comentarios', evolucion: 'Revisando la evolución', consultar_jql: 'Consultando Jira en vivo',
};

function download(text: string, q: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = /informe/i.test(q) ? `informe-ejecutivo-${stamp}.md` : `analisis-agente-${stamp}.md`;
  const url = URL.createObjectURL(new Blob([`> Pregunta: ${q}\n\n${text}\n`], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AgentPanel({ registerAsk, syncedAt, group, collapsed, onToggle }: { registerAsk: (fn: (q: string) => void) => void; syncedAt: number | null; group: string | null; collapsed: boolean; onToggle: (v?: boolean) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const groupRef = useRef<string | null>(group);
  groupRef.current = group;

  // Al cambiar de grupo la conversación anterior ya no aplica: se reinicia
  const prevGroup = useRef(group);
  useEffect(() => {
    if (prevGroup.current !== null && group !== null && prevGroup.current !== group) { ctl.current?.abort(); setMsgs([]); }
    if (group !== null) prevGroup.current = group;
  }, [group]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs]);

  const ask = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q || ctl.current) return;
    const history = msgsRef.current.filter((m) => m.done && !m.error).map((m) => ({ role: m.role, content: m.content }));
    const turns = [...history, { role: 'user' as const, content: q }].slice(-12);
    setMsgs((p) => [...p, { role: 'user', content: q, done: true }, { role: 'assistant', content: '', status: 'Pensando…' }]);
    const patch = (fn: (m: Msg) => Msg) => setMsgs((p) => [...p.slice(0, -1), fn(p[p.length - 1])]);
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    try {
      const res = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: turns, group: groupRef.current ?? undefined }), signal: c.signal });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        patch((m) => ({ ...m, status: undefined, error: j.error || 'No se pudo consultar al agente.' }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let text = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { type: string; text?: string; name?: string; message?: string };
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === 'text') { text += ev.text; patch((m) => ({ ...m, content: text, status: undefined })); }
          else if (ev.type === 'break') { if (text && !text.endsWith('\n\n')) text += '\n\n'; }
          else if (ev.type === 'tool') patch((m) => ({ ...m, status: `${TOOL_LABEL[ev.name || ''] || 'Consultando'}…` }));
          else if (ev.type === 'note') patch((m) => ({ ...m, error: ev.text }));
          else if (ev.type === 'error') patch((m) => ({ ...m, status: undefined, error: ev.message }));
          else if (ev.type === 'done') patch((m) => ({ ...m, status: undefined, done: true }));
        }
      }
      patch((m) => ({ ...m, status: undefined, done: m.done || (!!m.content && !m.error) }));
    } catch (e) {
      if ((e as Error).name === 'AbortError') patch((m) => ({ ...m, status: undefined, done: !!m.content, error: m.content ? 'Detenido.' : undefined }));
      else patch((m) => ({ ...m, status: undefined, error: 'Se perdió la conexión con el servidor.' }));
    } finally {
      ctl.current = null;
      setBusy(false);
    }
  }, []);

  useEffect(() => { registerAsk(ask); }, [ask, registerAsk]);

  const lastUser = (n: number) => { for (let k = n - 1; k >= 0; k--) if (msgs[k].role === 'user') return msgs[k].content; return ''; };

  return (
    <aside className="agent" aria-label="Agente">
      <button type="button" className="ag-rail" onClick={() => onToggle(false)} aria-label="Mostrar el agente" title="Mostrar el agente" hidden={!collapsed}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><span className="v">Agente{busy ? ' · respondiendo…' : ''}</span>
      </button>
      <div className="ag-body">
      <div className="ag-head">
        <h2>Agente</h2>
        <span className="note">{!syncedAt ? '' : group && group !== '*' ? `analiza el grupo «${group}»` : 'analiza todos los responsables'}</span>
        <button type="button" className="btn sm ag-collapse" onClick={() => onToggle(true)} aria-label="Minimizar el agente" title="Minimizar el agente"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>Minimizar</button>
      </div>
      <div className="ag-log" ref={logRef}>
        {msgs.length === 0 && (
          <div className="ag-intro">
            <p style={{ margin: 0 }}>Pregúntame por el estado del equipo, bloqueos, carga, despliegues o un issue concreto. Consulto Jira y separo hechos, inferencias y recomendaciones.</p>
            <div className="chips">{SUGGEST.map((s) => <button key={s} type="button" className="chip" onClick={() => ask(s)}>{s}</button>)}</div>
            <div><button type="button" className="btn" onClick={() => ask(REPORT_Q)}>Generar informe ejecutivo del mes</button></div>
          </div>
        )}
        {msgs.map((m, n) => m.role === 'user' ? (
          <div className="msg user" key={n}>{m.content}</div>
        ) : (
          <div className="msg bot" key={n}>
            {m.status && <div className="thinking">{m.status}</div>}
            {m.content && (
              <div className="md">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>{m.content}</ReactMarkdown>
              </div>
            )}
            {m.error && <div className="note" style={{ color: 'var(--warn)' }}>{m.error}</div>}
            {m.done && m.content && <div><button type="button" className="btn sm" onClick={() => download(m.content, lastUser(n))}>Descargar .md</button></div>}
          </div>
        ))}
      </div>
      <form className="ag-form" onSubmit={(e) => { e.preventDefault(); const v = input; setInput(''); ask(v); }}>
        <textarea
          id="ag-input" aria-label="Pregunta para el agente" placeholder="Pregunta sobre el equipo, un proyecto, un issue o el sprint…"
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
        />
        <div className="row">
          <span className="note">Solo lectura: no modifica Jira.</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn ghost sm" onClick={() => { ctl.current?.abort(); setMsgs([]); }}>Nueva conversación</button>
            {busy && <button type="button" className="btn" onClick={() => ctl.current?.abort()}>Detener</button>}
            <button type="submit" className="btn primary" disabled={busy || !input.trim()}>Preguntar</button>
          </div>
        </div>
      </form>
      </div>
    </aside>
  );
}
