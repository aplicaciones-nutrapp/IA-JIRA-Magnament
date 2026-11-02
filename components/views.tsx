'use client';
import { useMemo, useState } from 'react';
import type { Issue, Model, Week } from '@/lib/types';
import { DAY, TAGS, clip, r1, tagsOf } from '@/lib/rules';
import { dayOf, daysTxt, fD, fDT, fH, fS, fWD } from '@/lib/format';
import { Chip, CritPill, EnvChip, KeyBtn, KeyLink, KindTag, StatusPill } from './ui';

export interface Ctx {
  m: Model;
  byKey: Map<string, Issue>;
  open: (key: string) => void;
}

export interface TF { q: string; proj: string; dev: string; cat: string; flags: string[]; sort: string }
export const defaultTF: TF = { q: '', proj: '', dev: '', cat: 'abiertos', flags: [], sort: 'updated' };

/* ───────── gráfico semanal ───────── */
function niceStep(max: number) {
  const raw = Math.max(1, max / 4);
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return Math.max(1, (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p);
}
function WeekChart({ weeks }: { weeks: Week[] }) {
  const W = 640, H = 210, pl = 32, pr = 8, pt = 12, pb = 30, iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(1, ...weeks.flatMap((w) => [w.created, w.resolved]));
  const step = niceStep(max), top = Math.ceil(max / step) * step;
  const y = (v: number) => pt + ih - (v / top) * ih;
  const bw = iw / weeks.length, b = Math.max(3, (bw - 8) / 2);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Issues creados y resueltos por semana">
      {ticks.map((v) => (
        <g key={v}>
          <line className="grid" x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} />
          <text className="axis" x={pl - 6} y={y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}
      {weeks.map((w, k) => {
        const x = pl + k * bw + 4;
        return (
          <g key={w.start}>
            <rect className="a" x={x} y={y(w.created)} width={b} height={Math.max(0, pt + ih - y(w.created))} rx={1.5}><title>{`Semana del ${fS(w.start)}: ${w.created} creados`}</title></rect>
            <rect className="b" x={x + b} y={y(w.resolved)} width={b} height={Math.max(0, pt + ih - y(w.resolved))} rx={1.5}><title>{`Semana del ${fS(w.start)}: ${w.resolved} resueltos`}</title></rect>
            {k % 2 === 1 && <text className="axis" x={pl + k * bw + bw / 2} y={H - 10} textAnchor="middle">{fS(w.start)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ───────── Resumen ───────── */
export function Resumen({ m, open, onProject }: Ctx & { onProject: (k: string) => void }) {
  const k = m.kpi;
  const cats = { new: 0, indeterminate: 0, done: 0 };
  m.issues.forEach((i) => { cats[i.cat]++; });
  const tot = m.issues.length || 1;
  const Kpi = ({ v, l, s, cls = '' }: { v: React.ReactNode; l: string; s?: string; cls?: string }) => (
    <div className={`kpi ${cls}`}><span className="v">{v ?? '—'}</span><span className="l">{l}</span>{s && <span className="s">{s}</span>}</div>
  );
  return (
    <>
      <div className="kpis">
        <Kpi v={k.open} l="Issues abiertos" s={`${k.total} sincronizados`} />
        <Kpi v={k.inprog} l="En curso" s={`${k.stale} > ${m.rules.inprog} d en estado`} />
        <Kpi v={k.blocked} l="Bloqueados" s={`+${k.blockedInf} posibles`} cls={k.blocked ? 'crit' : ''} />
        <Kpi v={k.overdue} l="Vencidos" s="fecha límite pasada" cls={k.overdue ? 'warn' : ''} />
        <Kpi v={k.done30} l="Resueltos" s="últimos 30 días" />
        <Kpi v={k.medRes30 != null ? `${k.medRes30} d` : '—'} l="Tiempo de resolución" s="mediana, 30 días" />
        <Kpi v={k.prd7} l="Pasos a PRD" s="últimos 7 días" />
      </div>
      <div className="grid2">
        <section className="section">
          <div className="section-head"><h2>Alertas</h2><span className="small muted">Hechos de Jira e inferencias, separados</span></div>
          <div className="panel">
            {m.alerts.length ? m.alerts.map((a, n) => (
              <div className="alert" key={n}>
                <span className={`sev ${a.sev}`} aria-hidden="true" />
                <div className="t">{a.title} <KindTag kind={a.kind} /></div>
                <div className="d">{a.detail}</div>
                <div className="ks">{a.keys.slice(0, 6).map((x) => <KeyBtn key={x} k={x} onOpen={open} />)}{a.keys.length > 6 && <span className="small muted">+{a.keys.length - 6}</span>}</div>
              </div>
            )) : <div className="empty">Sin alertas con las reglas actuales.</div>}
          </div>
        </section>
        <div className="section" style={{ gap: 20 }}>
          <section className="section">
            <div className="section-head"><h2>Sprints activos</h2><span className="small muted">barra = avance · línea = hoy</span></div>
            <div className="panel">
              {m.sprints.length ? m.sprints.map((s) => (
                <div className="sprint" key={String(s.id)}>
                  <div className="section-head"><h3>{s.name}</h3><span className="small muted num">{fS(s.start)} – {fS(s.end)}{s.daysLeft != null && (s.daysLeft >= 0 ? ` · quedan ${s.daysLeft} d` : ' · finalizó')}</span></div>
                  <div className="prog"><div className="done" style={{ width: `${Math.round(s.prog * 100)}%` }} />{s.elapsed != null && <div className="now" style={{ left: `${Math.round(s.elapsed * 100)}%` }} />}</div>
                  <div className="small muted num">Avance {Math.round(s.prog * 100)}% {s.spT ? `(${s.spD}/${s.spT} SP)` : `(${s.done}/${s.total})`} · tiempo transcurrido {s.elapsed != null ? `${Math.round(s.elapsed * 100)}%` : '—'} · {s.total} issues{s.blocked ? <span style={{ color: 'var(--crit)' }}> · {s.blocked} bloqueados</span> : null}</div>
                </div>
              )) : <div className="empty">No hay sprints activos en estos proyectos. Los espacios de gestión de trabajo (Jira Work Management) no usan sprints.</div>}
            </div>
          </section>
          <section className="section">
            <div className="section-head"><h2>Distribución por categoría de estado</h2></div>
            <div className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="stack">
                <span style={{ width: `${(cats.new / tot) * 100}%`, background: 'var(--line-strong)' }} />
                <span style={{ width: `${(cats.indeterminate / tot) * 100}%`, background: 'var(--info)' }} />
                <span style={{ width: `${(cats.done / tot) * 100}%`, background: 'var(--ok)' }} />
              </div>
              <div className="legend num">
                <span><i style={{ background: 'var(--line-strong)' }} />Por hacer {cats.new}</span>
                <span><i style={{ background: 'var(--info)' }} />En curso {cats.indeterminate}</span>
                <span><i style={{ background: 'var(--ok)' }} />Finalizado {cats.done}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
      <section className="section">
        <div className="section-head"><h2>Proyectos</h2><span className="small muted">Ordenados por retraso: vencidos y bloqueados pesan doble. Toca uno para ver sus tareas.</span></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Proyecto</th><th className="r">Abiertos</th><th className="r">En curso</th><th className="r">Vencidos</th><th className="r">Bloqueados</th><th className="r">&gt;{m.rules.inprog} d en curso</th><th className="r">Resueltos 30 d</th><th className="r">Abierto más antiguo</th></tr></thead>
          <tbody>{m.projects.map((p) => (
            <tr className="click" key={p.key} onClick={() => onProject(p.key)}>
              <td><span className="key">{p.key}</span> <span className="muted small">{p.name}</span></td>
              <td className="r">{p.open}</td><td className="r">{p.inprog}</td>
              <td className="r">{p.overdue ? <span className="pill warn">{p.overdue}</span> : 0}</td>
              <td className="r">{p.blocked ? <span className="pill crit">{p.blocked}</span> : 0}</td>
              <td className="r">{p.stale}</td><td className="r">{p.done30}</td><td className="r">{Math.round(p.oldest)} d</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      <section className="section">
        <div className="section-head"><h2>Flujo semanal</h2><div className="legend"><span><i style={{ background: 'var(--bar-a)' }} />Creados</span><span><i style={{ background: 'var(--bar-b)' }} />Resueltos</span></div></div>
        <div className="panel panel-pad chart"><WeekChart weeks={m.weeks} /></div>
      </section>
    </>
  );
}

/* ───────── Equipo ───────── */
export function Equipo({ m, byKey, open }: Ctx) {
  const [exp, setExp] = useState<string | null>(null);
  const basis = m.hasSP ? 'spOpen' : 'open';
  const max = Math.max(1, ...m.team.map((p) => p[basis]));
  const act = m.team.filter((p) => p.name !== 'Sin asignar' && p[basis] > 0);
  const mean = act.length ? act.reduce((a, p) => a + p[basis], 0) / act.length : 0;
  const cols = m.hasSP ? 10 : 9;
  return (
    <>
      <div className="banner info"><p>La carga combina issues abiertos{m.hasSP ? ' y story points' : ''}; no mide productividad. Antes de comparar personas revisa prioridad, complejidad y contexto de cada tarea.</p></div>
      <div className="grid2">
        <section className="section">
          <div className="section-head"><h2>Carga abierta por persona</h2><span className="small muted">{m.hasSP ? 'Story points' : 'Issues'} abiertos · promedio {r1(mean)}</span></div>
          <div className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {m.team.length ? m.team.map((p) => (
              <div className="hbar" key={p.name}>
                <span className="clamp" title={p.name}>{p.name}</span>
                <div className="track"><div className={`fill ${mean && p[basis] > mean * 1.6 ? 'hi' : ''}`} style={{ width: `${(p[basis] / max) * 100}%` }} /></div>
                <span className="num small" style={{ textAlign: 'right' }}>{p[basis]}{m.hasSP ? ' SP' : ''}</span>
              </div>
            )) : <div className="empty">Sin datos</div>}
          </div>
        </section>
        <section className="section">
          <div className="section-head"><h2>Cómo leerlo</h2></div>
          <div className="panel panel-pad small" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0 }}>Barra ámbar: la persona tiene más de 1,6 veces la carga promedio del equipo. Es una señal para revisar, no una conclusión.</p>
            <p style={{ margin: 0 }}><strong>Detenidas</strong>: tareas en un estado de trabajo (sin contar DEV/QA/PRD) por más de {m.rules.inprog} días.</p>
            <p style={{ margin: 0 }}><strong>Resolución</strong>: mediana de días entre creación y resolución de lo cerrado en los últimos 90 días.</p>
            <p style={{ margin: 0 }}><strong>Última actividad</strong>: última transición o comentario hecho por la persona.</p>
          </div>
        </section>
      </div>
      <section className="section">
        <div className="section-head"><h2>Detalle por persona</h2><span className="small muted">Toca una fila para ver sus issues abiertos</span></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Persona</th><th className="r">Abiertos</th><th className="r">En curso</th>{m.hasSP && <th className="r">SP abiertos</th>}<th className="r">Vencidos</th><th className="r">Bloqueados</th><th className="r">Detenidas</th><th className="r">Resueltos 30 d</th><th className="r">Resolución</th><th className="r">Última actividad</th></tr></thead>
          <tbody>{m.team.map((p) => {
            const issues = p.keys.map((k) => byKey.get(k)!).filter(Boolean).sort((a, b) => b.prio - a.prio || (b.daysInStatus || 0) - (a.daysInStatus || 0));
            return [
              <tr className="click" key={p.name} onClick={() => setExp(exp === p.name ? null : p.name)}>
                <td><strong>{p.name}</strong></td><td className="r">{p.open}</td><td className="r">{p.inprog}</td>{m.hasSP && <td className="r">{p.spOpen}</td>}
                <td className="r">{p.overdue}</td><td className="r">{p.blocked ? <span className="pill crit">{p.blocked}</span> : 0}</td><td className="r">{p.stale}</td>
                <td className="r">{p.done30}{m.hasSP && <span className="muted small"> ({p.spDone30} SP)</span>}</td>
                <td className="r">{p.medRes != null ? `${p.medRes} d` : '—'}</td><td className="r small">{fS(p.last)}</td>
              </tr>,
              exp === p.name && (
                <tr key={p.name + '-x'}><td colSpan={cols} style={{ background: 'var(--surface-2)' }}>
                  {issues.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{issues.map((i) => (
                    <div key={i.key} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <KeyBtn k={i.key} onOpen={open} /> <StatusPill i={i} />
                      <span className="small muted num">{daysTxt(i.daysInStatus)} en estado · {i.priority}{i.sp != null ? ` · ${i.sp} SP` : ''}</span>
                      <span className="small" style={{ minWidth: 0, flex: '1 1 200px' }}>{i.summary}</span>
                      {i.blocked && <span className="pill crit">bloqueado</span>}{i.overdue && <span className="pill warn">vencido</span>}
                    </div>
                  ))}</div> : <span className="muted small">Sin issues abiertos.</span>}
                </td></tr>
              ),
            ];
          })}</tbody>
        </table></div>
      </section>
    </>
  );
}

/* ───────── Stoppers ───────── */
export function Stoppers({ m, byKey, open }: Ctx) {
  const [f, setF] = useState<'todos' | 'hechos' | 'inferidos'>('todos');
  const list = m.stoppers.filter((s) => f === 'todos' || (f === 'hechos' ? s.kind === 'hecho' : s.kind === 'inferencia'));
  return (
    <section className="section">
      <div className="section-head"><h2>Stoppers</h2>
        <div className="chips">
          <Chip on={f === 'todos'} onClick={() => setF('todos')}>Todos ({m.stoppers.length})</Chip>
          <Chip on={f === 'hechos'} onClick={() => setF('hechos')}>Registrados en Jira ({m.kpi.blocked})</Chip>
          <Chip on={f === 'inferidos'} onClick={() => setF('inferidos')}>Inferidos de comentarios ({m.kpi.blockedInf})</Chip>
        </div>
      </div>
      <p className="small muted" style={{ margin: 0, maxWidth: '80ch' }}><strong>Hecho</strong>: flag de impedimento, estado o etiqueta de bloqueo, o vínculo «bloqueado por» abierto. <strong>Inferencia</strong>: un comentario de los últimos 14 días habla de bloqueo o espera. La criticidad combina prioridad, tiempo transcurrido y si el issue está en el sprint activo.</p>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Criticidad</th><th>Issue</th><th>Problema</th><th>Responsable</th><th className="r">Identificado</th><th className="r">Tiempo</th><th>Último comentario</th><th>Posible quien lo resuelve</th></tr></thead>
        <tbody>{list.length ? list.map((s) => { const i = byKey.get(s.key)!; return (
          <tr className="click" key={s.key} onClick={() => open(s.key)}>
            <td><CritPill c={s.crit} /></td>
            <td><KeyLink i={i} /><div className="small muted">{i.project.key}</div></td>
            <td className="sum"><div className="clamp">{i.summary}</div><div className="small" style={{ marginTop: 3 }}>{s.reasons.join(' · ')} <KindTag kind={s.kind} /></div></td>
            <td>{i.assignee}</td>
            <td className="r small">{fD(s.since)}</td>
            <td className="r">{daysTxt(s.elapsed)}</td>
            <td className="sum small">{s.last ? <><div className="clamp">{s.last.text}</div><div className="muted">{s.last.by} · {fS(s.last.at)}</div></> : <span className="muted">Sin comentarios</span>}</td>
            <td className="small">{s.resolver}</td>
          </tr>
        ); }) : <tr><td colSpan={8} className="empty">No hay stoppers con este filtro.</td></tr>}</tbody>
      </table></div>
    </section>
  );
}

/* ───────── Tareas ───────── */
export function Tareas({ m, open, tf, setTf }: Ctx & { tf: TF; setTf: (t: TF) => void }) {
  const projs = useMemo(() => [...new Set(m.issues.map((i) => i.project.key))].sort(), [m]);
  const devs = useMemo(() => [...new Set(m.issues.map((i) => i.assignee))].sort(), [m]);
  const list = useMemo(() => {
    const q = tf.q.toLowerCase();
    const sorters: Record<string, (a: Issue, b: Issue) => number> = {
      updated: (a, b) => b.lastActivity - a.lastActivity,
      dias: (a, b) => (b.daysInStatus || 0) - (a.daysInStatus || 0),
      prio: (a, b) => b.prio - a.prio,
      due: (a, b) => (a.due || Infinity) - (b.due || Infinity),
    };
    return m.issues.filter((i) => {
      if (tf.proj && i.project.key !== tf.proj) return false;
      if (tf.dev && i.assignee !== tf.dev) return false;
      if (tf.cat === 'abiertos' && !i.open) return false;
      if (['new', 'indeterminate', 'done'].includes(tf.cat) && i.cat !== tf.cat) return false;
      for (const fl of tf.flags) {
        if (fl === 'vencidos' && !i.overdue) return false;
        if (fl === 'bloqueados' && !(i.blocked || i.blockInfer)) return false;
        if (fl === 'detenidas' && !i.stale) return false;
        if (fl === 'qa' && i.env !== 'QA') return false;
        if (fl === 'idavuelta' && i.backMoves < 2) return false;
        if (fl === 'sprint' && !i.activeSprint) return false;
      }
      if (q && !`${i.key} ${i.summary} ${i.status} ${i.assignee} ${i.labels.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort(sorters[tf.sort] || sorters.updated);
  }, [m, tf]);
  const flag = (v: string, l: string) => <Chip on={tf.flags.includes(v)} onClick={() => setTf({ ...tf, flags: tf.flags.includes(v) ? tf.flags.filter((x) => x !== v) : [...tf.flags, v] })}>{l}</Chip>;
  return (
    <section className="section">
      <div className="section-head"><h2>Tareas</h2><span className="small muted num">{list.length} de {m.issues.length}{list.length > 400 ? ' · mostrando 400' : ''}</span></div>
      <div className="filters">
        <div className="field" style={{ flex: '1 1 200px' }}><label htmlFor="tf-q">Buscar</label><input type="search" id="tf-q" placeholder="Clave, resumen, estado, persona" value={tf.q} onChange={(e) => setTf({ ...tf, q: e.target.value })} /></div>
        <div className="field"><label htmlFor="tf-proj">Proyecto</label><select id="tf-proj" value={tf.proj} onChange={(e) => setTf({ ...tf, proj: e.target.value })}><option value="">Todos</option>{projs.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div className="field"><label htmlFor="tf-dev">Responsable</label><select id="tf-dev" value={tf.dev} onChange={(e) => setTf({ ...tf, dev: e.target.value })}><option value="">Todos</option>{devs.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div className="field"><label htmlFor="tf-cat">Estado</label><select id="tf-cat" value={tf.cat} onChange={(e) => setTf({ ...tf, cat: e.target.value })}><option value="abiertos">Abiertos</option><option value="todos">Todos</option><option value="new">Por hacer</option><option value="indeterminate">En curso</option><option value="done">Finalizados</option></select></div>
        <div className="field"><label htmlFor="tf-sort">Orden</label><select id="tf-sort" value={tf.sort} onChange={(e) => setTf({ ...tf, sort: e.target.value })}><option value="updated">Última actividad</option><option value="dias">Días en estado</option><option value="prio">Prioridad</option><option value="due">Fecha límite</option></select></div>
      </div>
      <div className="chips">{flag('vencidos', 'Vencidos')}{flag('bloqueados', 'Bloqueados')}{flag('detenidas', `Más de ${m.rules.inprog} d en curso`)}{flag('qa', 'Pendientes de QA')}{flag('idavuelta', 'Ida y vuelta de estado')}{flag('sprint', 'Sprint activo')}</div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Clave</th><th>Resumen</th><th>Proyecto</th><th>Responsable</th><th>Estado</th><th className="r">En estado</th><th>Prioridad</th><th className="r">SP</th><th className="r">Vence</th><th className="r">Actividad</th></tr></thead>
        <tbody>{list.length ? list.slice(0, 400).map((i) => (
          <tr className="click" key={i.key} onClick={() => open(i.key)}>
            <td><KeyLink i={i} /></td>
            <td className="sum"><div className="clamp">{i.summary}</div><div className="small muted">{i.type}{i.versions.length ? ` · ${i.versions.join(', ')}` : ''}</div></td>
            <td className="small">{i.project.key}</td><td className="small">{i.assignee}</td>
            <td><StatusPill i={i} /> <EnvChip env={i.env} />{i.blocked ? <> <span className="pill crit">bloqueado</span></> : i.blockInfer ? <> <span className="pill warn">posible bloqueo</span></> : null}</td>
            <td className={`r ${i.stale ? '' : 'muted'}`}>{daysTxt(i.daysInStatus)}</td>
            <td className="small">{i.priority}</td><td className="r">{i.sp ?? '—'}</td>
            <td className="r small">{i.due ? <span style={i.overdue ? { color: 'var(--crit)', fontWeight: 600 } : undefined}>{fS(i.due)}</span> : '—'}</td>
            <td className="r small">{fS(i.lastActivity)}</td>
          </tr>
        )) : <tr><td colSpan={10} className="empty">Nada coincide con estos filtros.</td></tr>}</tbody>
      </table></div>
    </section>
  );
}

/* ───────── Despliegues ───────── */
export function Despliegues({ m, byKey }: Ctx) {
  const [env, setEnv] = useState<'todos' | 'DEV' | 'QA' | 'PRD'>('todos');
  const [days, setDays] = useState(30);
  const list = m.deploys.filter((d) => (env === 'todos' || d.env === env) && m.ref - d.at <= days * DAY);
  const groups = new Map<string, typeof list>();
  for (const d of list) { const k = dayOf(d.at); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(d); }
  const count = (e: string) => list.filter((d) => d.env === e).length;
  return (
    <section className="section">
      <div className="section-head"><h2>Bitácora de despliegues</h2><span className="small muted num">DEV {count('DEV')} · QA {count('QA')} · PRD {count('PRD')}</span></div>
      <div className="banner info"><p>Cada entrada es una transición hacia un estado de ambiente (DEV, QA o PRD) según las expresiones configuradas en Vercel. Jira no registra el resultado del pipeline ni la hora real del despliegue: para eso hace falta integrar la fuente de CI/CD.</p></div>
      <div className="chips">
        {(['todos', 'DEV', 'QA', 'PRD'] as const).map((e) => <Chip key={e} on={env === e} onClick={() => setEnv(e)}>{e === 'todos' ? 'Todos' : e}</Chip>)}
        <span style={{ width: 12 }} />
        {[7, 30, 90].map((d) => <Chip key={d} on={days === d} onClick={() => setDays(d)}>{d} días</Chip>)}
      </div>
      <div className="panel">
        {groups.size ? [...groups.entries()].map(([k, arr]) => (
          <div key={k}>
            <div className="day-h"><span>{fWD(arr[0].at)}</span><span className="muted num">{arr.length}</span></div>
            {arr.map((d, n) => { const i = byKey.get(d.key)!; return (
              <div className="dep" key={n}>
                <span className="time">{fH(d.at)}</span><span><EnvChip env={d.env} /></span>
                <div className="body">
                  <div className="line1"><KeyLink i={i} /> <span className="clamp" style={{ minWidth: 0 }}>{i.summary}</span></div>
                  <div className="small muted">{i.project.key} · {d.by} · {d.from || '—'} → {d.to}{i.versions.length ? ` · versión ${i.versions.join(', ')}` : ''}</div>
                  {d.after.length > 0 && <div className="small" style={{ color: 'var(--warn)' }}>Bugs creados en {i.project.key} en las 72 h siguientes: {d.after.join(', ')} <KindTag kind="Inferencia" /></div>}
                </div>
              </div>
            ); })}
          </div>
        )) : <div className="empty">No hay transiciones a ambientes en este rango. Si tus estados se llaman distinto, ajusta DEPLOY_REGEX_* en Vercel.</div>}
      </div>
    </section>
  );
}

/* ───────── Comentarios ───────── */
export function Comentarios({ m }: Ctx) {
  const [days, setDays] = useState(7);
  const [tag, setTag] = useState('');
  const [proj, setProj] = useState('');
  const projs = useMemo(() => [...new Set(m.issues.map((i) => i.project.key))].sort(), [m]);
  const all = useMemo(() => {
    const out: { i: Issue; c: Issue['comments'][number]; tags: string[] }[] = [];
    for (const i of m.issues) for (const c of i.comments) if (m.ref - c.at <= days * DAY) out.push({ i, c, tags: tagsOf(c.text) });
    return out;
  }, [m, days]);
  const list = all.filter((x) => (!tag || x.tags.includes(tag)) && (!proj || x.i.project.key === proj)).sort((a, b) => b.c.at - a.c.at);
  return (
    <section className="section">
      <div className="section-head"><h2>Comentarios</h2><span className="small muted num">{list.length} en {days} días</span></div>
      <div className="filters">
        <div className="field"><label htmlFor="cf-days">Periodo</label><select id="cf-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>Últimos {d} días</option>)}</select></div>
        <div className="field"><label htmlFor="cf-proj">Proyecto</label><select id="cf-proj" value={proj} onChange={(e) => setProj(e.target.value)}><option value="">Todos</option>{projs.map((p) => <option key={p}>{p}</option>)}</select></div>
      </div>
      <div className="chips">
        <Chip on={!tag} onClick={() => setTag('')}>Todos</Chip>
        {TAGS.map(([t]) => <Chip key={t} on={tag === t} onClick={() => setTag(t)}>{t[0].toUpperCase() + t.slice(1)} ({all.filter((x) => x.tags.includes(t)).length})</Chip>)}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Las etiquetas salen de palabras clave en el texto (inferencia). Para un resumen razonado de las conversaciones, pregúntale al agente.</p>
      <div className="panel">
        {list.length ? list.slice(0, 200).map(({ i, c, tags }, n) => (
          <div className="cmt" key={n}>
            <div className="h"><KeyLink i={i} /> <span className="muted">{clip(i.summary, 70)}</span></div>
            <div className="h"><strong>{c.by}</strong><span className="muted">{fDT(c.at)}</span>{tags.map((t) => <span key={t} className={`pill ${t === 'riesgo' || t === 'problema' ? 'warn' : t === 'intervención' ? 'crit' : 'info'}`}>{t}</span>)}</div>
            <div className="txt">{clip(c.text, 600)}</div>
          </div>
        )) : <div className="empty">No hay comentarios con este filtro.</div>}
      </div>
    </section>
  );
}
