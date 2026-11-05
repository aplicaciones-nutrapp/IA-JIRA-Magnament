'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Model, SyncError } from '@/lib/types';
import { fDT } from '@/lib/format';
import AgentPanel from './AgentPanel';
import IssueDrawer from './IssueDrawer';
import PersonDrawer from './PersonDrawer';
import type { Period } from '@/lib/format';
import { Comentarios, Completadas, Despliegues, Equipo, Resumen, Stoppers, Tareas, defaultTF, type KpiTarget, type TF } from './views';
import { isDone } from '@/lib/rules';
import { inPeriod } from '@/lib/format';
import { RulesCtx } from './ui';

const VIEWS = [
  ['resumen', 'Resumen'], ['equipo', 'Equipo'], ['stoppers', 'Stoppers'], ['tareas', 'Tareas'],
  ['despliegues', 'Despliegues'], ['comentarios', 'Comentarios'], ['completadas', 'Completadas'], ['agente', 'Agente'],
] as const;
type View = (typeof VIEWS)[number][0];
const REFRESH_MIN = Number(process.env.NEXT_PUBLIC_REFRESH_MINUTES) || 5;
const GROUP_KEY = 'di.group';
const AGENT_KEY = 'di.agent-collapsed';
const PERIOD_KEY = 'di.period';
const isWide = () => typeof window !== 'undefined' && window.matchMedia('(min-width:1180px)').matches;

export default function Dashboard() {
  const [model, setModel] = useState<Model | null>(null);
  const [err, setErr] = useState<SyncError | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('resumen');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [tf, setTf] = useState<TF>(defaultTF);
  const [person, setPerson] = useState<string | null>(null);
  const [period, setPeriodState] = useState<Period>('hoy');
  const [agentCollapsed, setAgentCollapsed] = useState(false);
  // Filtros iniciales al llegar desde una métrica del resumen (n fuerza a reiniciar la vista)
  const [preset, setPreset] = useState<{ n: number; stop?: 'todos' | 'hechos' | 'inferidos'; done?: '30d'; dep?: { env: 'todos' | 'DEV' | 'QA' | 'PRD'; days: number } }>({ n: 0 });
  const askFn = useRef<((q: string) => void) | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  // null = grupo por defecto del servidor (TEAM_DEFAULT_GROUP); '*' = todos; otro valor = nombre del grupo
  const groupRef = useRef<string | null>(null);

  const load = useCallback(async function run(force = false): Promise<void> {
    setBusy(true);
    try {
      const q = new URLSearchParams();
      if (force) q.set('force', '1');
      if (groupRef.current) q.set('group', groupRef.current);
      const res = await fetch(`/api/jira/sync?${q}`, { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const j = await res.json();
      if (res.status === 400 && j.code === 'unknown_group' && groupRef.current) {
        // El grupo guardado ya no existe en TEAM_GROUPS: vuelve al grupo por defecto
        groupRef.current = null;
        try { localStorage.removeItem(GROUP_KEY); } catch { /* sin almacenamiento */ }
        return run(force);
      }
      if (!res.ok) setErr(j); else { setModel(j); setErr(null); }
    } catch {
      setErr({ error: 'No hay conexión con el servidor.' });
    } finally {
      setBusy(false);
    }
  }, []);

  const changeGroup = (g: string) => {
    groupRef.current = g;
    try { localStorage.setItem(GROUP_KEY, g); } catch { /* sin almacenamiento */ }
    setTf(defaultTF);
    load();
  };

  useEffect(() => {
    try {
      groupRef.current = localStorage.getItem(GROUP_KEY);
      setAgentCollapsed(localStorage.getItem(AGENT_KEY) === '1');
      const per = localStorage.getItem(PERIOD_KEY) as Period | null;
      if (per && ['hoy', 'ayer', '7d', '30d'].includes(per)) setPeriodState(per);
    } catch { /* sin almacenamiento */ }
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
  const toggleAgent = useCallback((v?: boolean) => {
    setAgentCollapsed((cur) => {
      const next = v ?? !cur;
      try { localStorage.setItem(AGENT_KEY, next ? '1' : '0'); } catch { /* sin almacenamiento */ }
      return next;
    });
  }, []);
  const setPeriod = useCallback((p: Period) => { setPeriodState(p); try { localStorage.setItem(PERIOD_KEY, p); } catch { /* sin almacenamiento */ } }, []);
  const ask = useCallback((q: string) => { if (!isWide()) window.location.hash = 'agente'; else toggleAgent(false); setPerson(null); askFn.current?.(q); }, [toggleAgent]);
  const registerAsk = useCallback((fn: (q: string) => void) => { askFn.current = fn; }, []);
  const closeDrawer = useCallback(() => setOpenKey(null), []);
  const closePerson = useCallback(() => setPerson(null), []);
  const onKpi = (t: KpiTarget) => {
    const n = preset.n + 1;
    if (t === 'blocked') { setPreset({ n, stop: 'hechos' }); go('stoppers'); return; }
    if (t === 'prd7') { setPreset({ n, dep: { env: 'PRD', days: 7 } }); go('despliegues'); return; }
    if (t === 'done30') { setPreset({ n, done: '30d' }); go('completadas'); return; }
    const map: Record<string, Partial<TF>> = {
      open: { cat: 'abiertos' }, inprog: { cat: 'indeterminate' }, overdue: { cat: 'abiertos', flags: ['vencidos'] }, done30: { cat: 'todos', flags: ['completados30'] },
    };
    setTf({ ...defaultTF, ...map[t] });
    go('tareas');
  };
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; };

  const ctx = model ? { m: model, byKey, open: setOpenKey, openPerson: setPerson } : null;
  const hot = model ? model.stoppers.filter((s) => s.kind === 'hecho').length : 0;
  const doneToday = useMemo(() => (model ? model.issues.filter((i) => isDone(i) && inPeriod(i.resolved, 'hoy')).length : 0), [model]);

  return (
    <RulesCtx.Provider value={model?.rules ?? null}>
    <div className={`view-${view}${agentCollapsed ? ' agent-collapsed' : ''}`}>
      <header className="top" ref={headerRef}>
        <div className="top-in">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none"><path d="M2 12.5 6 8l3 2.5L14 4" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div><h1>Development Intelligence</h1><div className="sub">Aplicaciones Digitales · seguimiento sobre Jira</div></div>
          </div>
          <div className="source">
            {model && model.groups.length > 0 && (
              <label className="grp-sel">Grupo
                <select value={model.group ?? '*'} onChange={(e) => changeGroup(e.target.value)} disabled={busy}>
                  <option value="*">Todos los responsables</option>
                  {model.groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            )}
            <span className={`dot ${busy ? 'busy' : err ? 'err' : ''}`} />
            {model ? (
              <span title={model.jql}>{new URL(model.site).host} · sincronizado {fDT(model.ref)} · {model.issues.length} issues</span>
            ) : <span>{busy ? 'Conectando con Jira…' : 'Sin datos'}</span>}
            <button type="button" className="btn sm" onClick={() => load(true)} disabled={busy}>{busy ? 'Sincronizando…' : 'Sincronizar'}</button>
            <button type="button" className="btn sm agent-toggle" onClick={() => toggleAgent()} aria-pressed={!agentCollapsed}>{agentCollapsed ? 'Mostrar agente' : 'Minimizar agente'}</button>
            <button type="button" className="btn ghost sm" onClick={logout}>Salir</button>
          </div>
        </div>
        <nav className="tabs" aria-label="Vistas">
          {VIEWS.map(([k, l]) => (
            <a key={k} href={`#${k}`} className={k === 'agente' ? 'tab-agent' : undefined} aria-current={view === k ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(k); }}>
              {l}{k === 'stoppers' && model && <span className={`count ${hot ? 'hot' : ''}`}>{model.stoppers.length}</span>}{k === 'completadas' && model && doneToday > 0 && <span className="count ok" title="Completadas hoy">{doneToday} hoy</span>}
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
          {model && model.issues.length === 0 && (model.group ? (
            <div className="banner info"><p><strong>Ningún issue sincronizado está asignado al grupo «{model.group}».</strong> Revisa los nombres del grupo en TEAM_GROUPS o elige «Todos los responsables».</p></div>
          ) : (
            <div className="banner info"><p><strong>La consulta no devolvió issues.</strong> Revisa las claves de proyecto y el rango de fechas de JIRA_JQL en Vercel. JQL actual: <code>{model.jql}</code></p></div>
          ))}
          {model && model.group && model.groupMissing.length > 0 && (
            <div className="banner"><p>Del grupo «{model.group}», estas personas no son responsables de ningún issue sincronizado: <strong>{model.groupMissing.join(', ')}</strong>. Si deberían tener tareas, revisa que el nombre en TEAM_GROUPS esté escrito igual que en Jira o usa su accountId.</p></div>
          )}
          {model && model.truncated && <div className="banner"><p>La sincronización llegó al límite de páginas (JIRA_MAX_PAGES). Acota el JQL o sube el límite para traer todo.</p></div>}
          {ctx && model!.issues.length > 0 && (
            <>
              {view === 'resumen' && <Resumen {...ctx} onKpi={onKpi} onProject={(p) => { setTf({ ...defaultTF, proj: p }); go('tareas'); }} />}
              {view === 'equipo' && <Equipo {...ctx} />}
              {view === 'stoppers' && <Stoppers key={`st-${preset.n}`} {...ctx} initKind={preset.stop} />}
              {view === 'tareas' && <Tareas {...ctx} tf={tf} setTf={setTf} />}
              {view === 'despliegues' && <Despliegues key={`dp-${preset.n}`} {...ctx} init={preset.dep} />}
              {view === 'comentarios' && <Comentarios {...ctx} />}
              {view === 'completadas' && <Completadas key={`cp-${preset.n}`} {...ctx} initPeriod={preset.done} />}
            </>
          )}
        </main>
        <AgentPanel registerAsk={registerAsk} syncedAt={model?.ref ?? null} group={model ? model.group ?? '*' : null} collapsed={agentCollapsed} onToggle={toggleAgent} />
      </div>

      {person && model && <PersonDrawer name={person} m={model} period={period} setPeriod={setPeriod} onClose={closePerson} onOpenIssue={setOpenKey} escActive={!openKey} />}
      {openKey && byKey.get(openKey) && <IssueDrawer i={byKey.get(openKey)!} avatars={model?.avatars || {}} onClose={closeDrawer} onAsk={ask} />}
    </div>
    </RulesCtx.Provider>
  );
}
