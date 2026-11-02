'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Model, SyncError } from '@/lib/types';
import { fDT } from '@/lib/format';
import AgentPanel from './AgentPanel';
import IssueDrawer from './IssueDrawer';
import { Comentarios, Despliegues, Equipo, Resumen, Stoppers, Tareas, defaultTF, type TF } from './views';

const VIEWS = [
  ['resumen', 'Resumen'], ['equipo', 'Equipo'], ['stoppers', 'Stoppers'], ['tareas', 'Tareas'],
  ['despliegues', 'Despliegues'], ['comentarios', 'Comentarios'], ['agente', 'Agente'],
] as const;
type View = (typeof VIEWS)[number][0];
const REFRESH_MIN = Number(process.env.NEXT_PUBLIC_REFRESH_MINUTES) || 5;
const isWide = () => typeof window !== 'undefined' && window.matchMedia('(min-width:1180px)').matches;

export default function Dashboard() {
  const [model, setModel] = useState<Model | null>(null);
  const [err, setErr] = useState<SyncError | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('resumen');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [tf, setTf] = useState<TF>(defaultTF);
  const askFn = useRef<((q: string) => void) | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  const load = useCallback(async (force = false) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/jira/sync${force ? '?force=1' : ''}`, { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const j = await res.json();
      if (!res.ok) setErr(j); else { setModel(j); setErr(null); }
    } catch {
      setErr({ error: 'No hay conexión con el servidor.' });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MIN * 60000);
    return () => clearInterval(id);
  }, [load]);

  // Navegación por #hash
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as View;
      const v = VIEWS.some(([k]) => k === h) ? h : 'resumen';
      setView(v === 'agente' && isWide() ? 'resumen' : v);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  // Altura real del encabezado para el panel del agente
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--hdr', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byKey = useMemo(() => new Map((model?.issues || []).map((i) => [i.key, i])), [model]);
  const go = (v: View) => { window.location.hash = v; };
  const ask = useCallback((q: string) => { if (!isWide()) window.location.hash = 'agente'; askFn.current?.(q); }, []);
  const registerAsk = useCallback((fn: (q: string) => void) => { askFn.current = fn; }, []);
  const closeDrawer = useCallback(() => setOpenKey(null), []);
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; };

  const ctx = model ? { m: model, byKey, open: setOpenKey } : null;
  const hot = model ? model.stoppers.filter((s) => s.kind === 'hecho').length : 0;

  return (
    <div className={`view-${view}`}>
      <header className="top" ref={headerRef}>
        <div className="top-in">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none"><path d="M2 12.5 6 8l3 2.5L14 4" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div><h1>Development Intelligence</h1><div className="sub">Aplicaciones Digitales · seguimiento sobre Jira</div></div>
          </div>
          <div className="source">
            <span className={`dot ${busy ? 'busy' : err ? 'err' : ''}`} />
            {model ? (
              <span title={model.jql}>{new URL(model.site).host} · sincronizado {fDT(model.ref)} · {model.issues.length} issues</span>
            ) : <span>{busy ? 'Conectando con Jira…' : 'Sin datos'}</span>}
            <button type="button" className="btn sm" onClick={() => load(true)} disabled={busy}>{busy ? 'Sincronizando…' : 'Sincronizar'}</button>
            <button type="button" className="btn ghost sm" onClick={logout}>Salir</button>
          </div>
        </div>
        <nav className="tabs" aria-label="Vistas">
          {VIEWS.map(([k, l]) => (
            <a key={k} href={`#${k}`} className={k === 'agente' ? 'tab-agent' : undefined} aria-current={view === k ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(k); }}>
              {l}{k === 'stoppers' && model && <span className={`count ${hot ? 'hot' : ''}`}>{model.stoppers.length}</span>}
            </a>
          ))}
        </nav>
      </header>

      <div className="shell">
        <main>
          {err && (
            <div className="banner crit">
              <p><strong>{err.error}</strong>{err.detail ? <><br /><span className="small">{err.detail}</span></> : null}{model ? <><br /><span className="small">Se muestran los datos de la última sincronización correcta.</span></> : null}</p>
              <button type="button" className="btn" onClick={() => load(true)}>Reintentar</button>
            </div>
          )}
          {!model && !err && <div className="skeleton"><span className="thinking">Consultando Jira…</span></div>}
          {model && model.issues.length === 0 && (
            <div className="banner info"><p><strong>La consulta no devolvió issues.</strong> Revisa las claves de proyecto y el rango de fechas de JIRA_JQL en Vercel. JQL actual: <code>{model.jql}</code></p></div>
          )}
          {model && model.truncated && <div className="banner"><p>La sincronización llegó al límite de páginas (JIRA_MAX_PAGES). Acota el JQL o sube el límite para traer todo.</p></div>}
          {ctx && model!.issues.length > 0 && (
            <>
              {view === 'resumen' && <Resumen {...ctx} onProject={(p) => { setTf({ ...defaultTF, proj: p }); go('tareas'); }} />}
              {view === 'equipo' && <Equipo {...ctx} />}
              {view === 'stoppers' && <Stoppers {...ctx} />}
              {view === 'tareas' && <Tareas {...ctx} tf={tf} setTf={setTf} />}
              {view === 'despliegues' && <Despliegues {...ctx} />}
              {view === 'comentarios' && <Comentarios {...ctx} />}
            </>
          )}
        </main>
        <AgentPanel registerAsk={registerAsk} syncedAt={model?.ref ?? null} />
      </div>

      {openKey && byKey.get(openKey) && <IssueDrawer i={byKey.get(openKey)!} onClose={closeDrawer} onAsk={ask} />}
    </div>
  );
}
