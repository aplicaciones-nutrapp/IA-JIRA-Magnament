'use client';
import { useMemo, useState } from 'react';
import type { Deploy, Issue, Model, Week } from '@/lib/types';
import { DAY, TAGS, TONE_LABEL, clip, isDone, r1, tagsOf } from '@/lib/rules';
import { dayOf, daysTxt, fH, fS, inPeriod, relDayLabel } from '@/lib/format';
import { Avatar, Chip, CritPill, EnvChip, KeyBtn, KeyLink, KindTag, PersonTag, SearchField, SelectField, StatusPill, StatusTag, matches, useSort } from './ui';

export type KpiTarget = 'open' | 'inprog' | 'blocked' | 'overdue' | 'done30' | 'prd7';

export interface Ctx {
  m: Model;
  byKey: Map<string, Issue>;
  open: (key: string) => void;
  openPerson: (name: string) => void;
}

export interface TF { q: string; proj: string; dev: string; cat: string; flags: string[]; sort: string }
export const defaultTF: TF = { q: '', proj: '', dev: '', cat: 'abiertos', flags: [], sort: 'updated' };

const uniq = (a: string[]) => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, 'es'));

function Count({ n, total, what }: { n: number; total: number; what: string }) {
  return <span className="count-line num">{n === total ? `${total} ${what}` : `${n} de ${total} ${what}`}</span>;
}

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
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Issues creados y completados por semana">
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
            <rect className="b" x={x + b} y={y(w.resolved)} width={b} height={Math.max(0, pt + ih - y(w.resolved))} rx={1.5}><title>{`Semana del ${fS(w.start)}: ${w.resolved} completados`}</title></rect>
            {k % 2 === 1 && <text className="axis" x={pl + k * bw + bw / 2} y={H - 10} textAnchor="middle">{fS(w.start)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ───────── Resumen ───────── */
export function Resumen({ m, open, onProject, onKpi }: Ctx & { onProject: (k: string) => void; onKpi: (t: KpiTarget) => void }) {
  const k = m.kpi;
  const [pq, setPq] = useState('');
  const cats = { new: 0, indeterminate: 0, done: 0 };
  m.issues.forEach((i) => { cats[i.cat]++; });
  const tot = m.issues.length || 1;
  const projRows = useMemo(() => m.projects.filter((p) => matches(pq, p.key, p.name)), [m, pq]);
  const ps = useSort(projRows, {
    proj: (p) => p.key, open: (p) => p.open, inprog: (p) => p.inprog, overdue: (p) => p.overdue, blocked: (p) => p.blocked,
    stale: (p) => p.stale, done30: (p) => p.done30, oldest: (p) => p.oldest, delay: (p) => p.delay,
  }, { key: 'delay', dir: 'desc' });
  const Kpi = ({ v, l, s, cls = '', to }: { v: React.ReactNode; l: string; s?: string; cls?: string; to: KpiTarget }) => (
    <button type="button" className={`kpi ${cls}`} onClick={() => onKpi(to)} title="Ver las incidencias de esta cifra"><span className="v">{v ?? '—'}</span><span className="l">{l}</span>{s && <span className="s">{s}</span>}</button>
  );
  return (
    <>
      <div className="kpis">
        <Kpi to="open" v={k.open} l="Issues abiertos" s={`${k.total} sincronizados`} />
        <Kpi to="inprog" v={k.inprog} l="En curso" s={`${k.stale} > ${m.rules.inprog} d en estado`} />
        <Kpi to="blocked" v={k.blocked} l="Bloqueados" s={`+${k.blockedInf} posibles`} cls={k.blocked ? 'crit' : ''} />
        <Kpi to="overdue" v={k.overdue} l="Vencidos" s="fecha límite pasada" cls={k.overdue ? 'warn' : ''} />
        <Kpi to="done30" v={k.done30} l="Completados" s="últimos 30 días" />
        <Kpi to="done30" v={k.medRes30 != null ? `${k.medRes30} d` : '—'} l="Tiempo de resolución" s="mediana, 30 días" />
        <Kpi to="prd7" v={k.prd7} l="Pasos a PRD" s="últimos 7 días" />
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
        <div className="section-head"><h2>Proyectos</h2><Count n={projRows.length} total={m.projects.length} what="proyectos" /></div>
        <div className="filters"><SearchField id="pf-q" value={pq} onChange={setPq} placeholder="Clave o nombre del proyecto" /></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr>{ps.th('proj', 'Proyecto')}{ps.th('open', 'Abiertos', { num: true, cls: 'r' })}{ps.th('inprog', 'En curso', { num: true, cls: 'r' })}{ps.th('overdue', 'Vencidos', { num: true, cls: 'r' })}{ps.th('blocked', 'Bloqueados', { num: true, cls: 'r' })}{ps.th('stale', `>${m.rules.inprog} d en curso`, { num: true, cls: 'r' })}{ps.th('done30', 'Completados 30 d', { num: true, cls: 'r' })}{ps.th('oldest', 'Abierto más antiguo', { num: true, cls: 'r' })}</tr></thead>
          <tbody>{ps.sorted.length ? ps.sorted.map((p) => (
            <tr className="click" key={p.key} onClick={() => onProject(p.key)} title="Ver las tareas del proyecto">
              <td><span className="key">{p.key}</span> <span className="muted small">{p.name}</span></td>
              <td className="r">{p.open}</td><td className="r">{p.inprog}</td>
              <td className="r">{p.overdue ? <span className="pill warn">{p.overdue}</span> : 0}</td>
              <td className="r">{p.blocked ? <span className="pill crit">{p.blocked}</span> : 0}</td>
              <td className="r">{p.stale}</td><td className="r">{p.done30}</td><td className="r">{Math.round(p.oldest)} d</td>
            </tr>
          )) : <tr><td colSpan={8} className="empty">Ningún proyecto coincide.</td></tr>}</tbody>
        </table></div>
      </section>
      <section className="section">
        <div className="section-head"><h2>Flujo semanal</h2><div className="legend"><span><i style={{ background: 'var(--bar-a)' }} />Creados</span><span><i style={{ background: 'var(--bar-b)' }} />Completados</span></div></div>
        <div className="panel panel-pad chart"><WeekChart weeks={m.weeks} /></div>
      </section>
    </>
  );
}

/* ───────── Equipo ───────── */
export function Equipo({ m, openPerson }: Ctx) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => m.team.filter((p) => matches(q, p.name)), [m, q]);
  const basis = m.hasSP ? 'spOpen' : 'open';
  const max = Math.max(1, ...m.team.map((p) => p[basis]));
  const act = m.team.filter((p) => p.name !== 'Sin asignar' && p[basis] > 0);
  const mean = act.length ? act.reduce((a, p) => a + p[basis], 0) / act.length : 0;
  const ts = useSort(rows, {
    name: (p) => p.name, open: (p) => p.open, inprog: (p) => p.inprog, sp: (p) => p.spOpen, overdue: (p) => p.overdue, blocked: (p) => p.blocked,
    stale: (p) => p.stale, res: (p) => p.medRes, last: (p) => p.last,
  }, { key: m.hasSP ? 'sp' : 'open', dir: 'desc' });
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
                <button type="button" className="btn link clamp" style={{ textAlign: 'left', color: 'var(--fg)' }} title={p.name} onClick={() => openPerson(p.name)}>{p.name}</button>
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
            <p style={{ margin: 0 }}><strong>Detalle</strong>: toca a una persona para ver sus abiertos y lo que completó hoy, ayer o en los últimos días.</p>
            <p style={{ margin: 0 }}><strong>Detenidas</strong>: tareas en un estado de trabajo (sin contar DEV/QA/PRD) por más de {m.rules.inprog} días.</p>
            <p style={{ margin: 0 }}><strong>Resolución</strong>: mediana de días entre creación y cierre de lo completado en los últimos 90 días.</p>
          </div>
        </section>
      </div>
      <section className="section">
        <div className="section-head"><h2>Detalle por persona</h2><span className="small muted">Toca una persona para ver su detalle</span></div>
        <div className="filters">
          <SearchField id="eq-q" value={q} onChange={setQ} placeholder="Nombre de la persona" />
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th className="photo-cell">Foto</th>{ts.th('name', 'Persona')}{ts.th('open', 'Abiertos', { num: true, cls: 'r' })}{ts.th('inprog', 'En curso', { num: true, cls: 'r' })}{m.hasSP && ts.th('sp', 'SP abiertos', { num: true, cls: 'r' })}{ts.th('overdue', 'Vencidos', { num: true, cls: 'r' })}{ts.th('blocked', 'Bloqueados', { num: true, cls: 'r' })}{ts.th('stale', 'Detenidas', { num: true, cls: 'r' })}{ts.th('res', 'Resolución', { num: true, cls: 'r' })}{ts.th('last', 'Última actividad', { num: true, cls: 'r' })}</tr></thead>
          <tbody>{ts.sorted.length ? ts.sorted.map((p) => (
            <tr className="click" key={p.name} onClick={() => openPerson(p.name)}>
              <td className="photo-cell"><Avatar name={p.name} src={m.avatars[p.name]} size={34} /></td>
              <td style={{ whiteSpace: 'nowrap' }}><strong>{p.name}</strong></td>
              <td className="r">{p.open}</td><td className="r">{p.inprog}</td>{m.hasSP && <td className="r">{p.spOpen}</td>}
              <td className="r">{p.overdue ? <span className="pill warn">{p.overdue}</span> : 0}</td>
              <td className="r">{p.blocked ? <span className="pill crit">{p.blocked}</span> : 0}</td>
              <td className="r">{p.stale}</td>
              <td className="r">{p.medRes != null ? `${p.medRes} d` : '—'}</td><td className="r small">{fS(p.last)}</td>
            </tr>
          )) : <tr><td colSpan={cols} className="empty">Nadie coincide con la búsqueda.</td></tr>}</tbody>
        </table></div>
      </section>
    </>
  );
}

/* ───────── Stoppers ───────── */
const CRIT_RANK = { Alta: 0, Media: 1, Baja: 2 } as const;
export function Stoppers({ m, byKey, open, initKind = 'todos' }: Ctx & { initKind?: 'todos' | 'hechos' | 'inferidos' }) {
  const [kind, setKind] = useState<'todos' | 'hechos' | 'inferidos'>(initKind);
  const [q, setQ] = useState('');
  const [crit, setCrit] = useState('');
  const [proj, setProj] = useState('');
  const [dev, setDev] = useState('');
  const projs = useMemo(() => uniq(m.stoppers.map((s) => byKey.get(s.key)!.project.key)), [m, byKey]);
  const devs = useMemo(() => uniq(m.stoppers.map((s) => byKey.get(s.key)!.assignee)), [m, byKey]);
  const rows = useMemo(() => m.stoppers.filter((s) => {
    const i = byKey.get(s.key)!;
    if (kind === 'hechos' && s.kind !== 'hecho') return false;
    if (kind === 'inferidos' && s.kind !== 'inferencia') return false;
    if (crit && s.crit !== crit) return false;
    if (proj && i.project.key !== proj) return false;
    if (dev && i.assignee !== dev) return false;
    return matches(q, i.key, i.summary, s.reasons.join(' '), s.last?.text, s.resolver);
  }), [m, byKey, kind, crit, proj, dev, q]);
  const ss = useSort(rows, {
    crit: (s) => CRIT_RANK[s.crit], key: (s) => s.key, dev: (s) => byKey.get(s.key)!.assignee, since: (s) => s.since, elapsed: (s) => s.elapsed, resolver: (s) => s.resolver,
  }, { key: 'crit', dir: 'asc' });
  return (
    <section className="section">
      <div className="section-head"><h2>Stoppers</h2><Count n={rows.length} total={m.stoppers.length} what="stoppers" /></div>
      <div className="chips">
        <Chip on={kind === 'todos'} onClick={() => setKind('todos')}>Todos ({m.stoppers.length})</Chip>
        <Chip on={kind === 'hechos'} onClick={() => setKind('hechos')}>Registrados en Jira ({m.kpi.blocked})</Chip>
        <Chip on={kind === 'inferidos'} onClick={() => setKind('inferidos')}>Inferidos de comentarios ({m.kpi.blockedInf})</Chip>
      </div>
      <div className="filters">
        <SearchField id="st-q" value={q} onChange={setQ} placeholder="Clave, resumen, motivo o comentario" />
        <SelectField id="st-crit" label="Criticidad" value={crit} onChange={setCrit} options={['Alta', 'Media', 'Baja']} all="Todas" />
        <SelectField id="st-proj" label="Proyecto" value={proj} onChange={setProj} options={projs} />
        <SelectField id="st-dev" label="Responsable" value={dev} onChange={setDev} options={devs} />
      </div>
      <p className="small muted" style={{ margin: 0, maxWidth: '80ch' }}><strong>Hecho</strong>: flag de impedimento, estado o etiqueta de bloqueo, o vínculo «bloqueado por» abierto. <strong>Inferencia</strong>: un comentario de los últimos 14 días habla de bloqueo o espera. La criticidad combina prioridad, tiempo transcurrido y si el issue está en el sprint activo.</p>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr>{ss.th('crit', 'Criticidad')}{ss.th('key', 'Issue')}<th>Problema</th>{ss.th('dev', 'Responsable')}{ss.th('since', 'Identificado', { num: true, cls: 'r' })}{ss.th('elapsed', 'Tiempo', { num: true, cls: 'r' })}<th>Último comentario</th>{ss.th('resolver', 'Posible quien lo resuelve')}</tr></thead>
        <tbody>{ss.sorted.length ? ss.sorted.map((s) => { const i = byKey.get(s.key)!; return (
          <tr className="click" key={s.key} onClick={() => open(s.key)}>
            <td><CritPill c={s.crit} /></td>
            <td><KeyLink i={i} /><div className="small muted">{i.project.key}</div></td>
            <td className="sum"><div className="clamp">{i.summary}</div><div className="small" style={{ marginTop: 3 }}>{s.reasons.join(' · ')} <KindTag kind={s.kind} /></div></td>
            <td><PersonTag name={i.assignee} avatars={m.avatars} /></td>
            <td className="r small" style={{ whiteSpace: 'nowrap' }}>{fS(s.since)}</td>
            <td className="r">{daysTxt(s.elapsed)}</td>
            <td className="sum small">{s.last ? <><div className="clamp">{s.last.text}</div><div className="muted">{s.last.by} · {fS(s.last.at)}</div></> : <span className="muted">Sin comentarios</span>}</td>
            <td className="small">{s.resolver}</td>
          </tr>
        ); }) : <tr><td colSpan={8} className="empty">No hay stoppers con estos filtros.</td></tr>}</tbody>
      </table></div>
    </section>
  );
}

/* ───────── Tareas ───────── */
export function Tareas({ m, open, tf, setTf }: Ctx & { tf: TF; setTf: (t: TF) => void }) {
  const projs = useMemo(() => uniq(m.issues.map((i) => i.project.key)), [m]);
  const devs = useMemo(() => uniq(m.issues.map((i) => i.assignee)), [m]);
  const rows = useMemo(() => m.issues.filter((i) => {
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
      if (fl === 'hoy' && !inPeriod(i.lastActivity, 'hoy')) return false;
      if (fl === 'completados30' && !(isDone(i) && m.ref - (i.resolved || 0) <= 30 * DAY)) return false;
    }
    return matches(tf.q, i.key, i.summary, i.status, i.assignee, i.labels.join(' '));
  }), [m, tf]);
  const ts = useSort(rows, {
    key: (i) => i.key, sum: (i) => i.summary, proj: (i) => i.project.key, dev: (i) => i.assignee, status: (i) => i.status,
    days: (i) => i.daysInStatus, prio: (i) => i.prio, sp: (i) => i.sp, due: (i) => i.due, act: (i) => i.lastActivity,
  }, { key: 'act', dir: 'desc' });
  const flag = (v: string, l: string) => <Chip on={tf.flags.includes(v)} onClick={() => setTf({ ...tf, flags: tf.flags.includes(v) ? tf.flags.filter((x) => x !== v) : [...tf.flags, v] })}>{l}</Chip>;
  return (
    <section className="section">
      <div className="section-head"><h2>Tareas</h2><span className="count-line num">{rows.length} de {m.issues.length}{rows.length > 400 ? ' · mostrando 400' : ''}</span></div>
      <div className="filters">
        <SearchField id="tf-q" value={tf.q} onChange={(v) => setTf({ ...tf, q: v })} placeholder="Clave, resumen, estado, persona" />
        <SelectField id="tf-proj" label="Proyecto" value={tf.proj} onChange={(v) => setTf({ ...tf, proj: v })} options={projs} />
        <SelectField id="tf-dev" label="Responsable" value={tf.dev} onChange={(v) => setTf({ ...tf, dev: v })} options={devs} />
        <SelectField id="tf-cat" label="Estado" value={tf.cat} onChange={(v) => setTf({ ...tf, cat: v })} all={null} options={[['abiertos', 'Abiertos'], ['todos', 'Todos'], ['new', 'Por hacer'], ['indeterminate', 'En curso'], ['done', 'Finalizados']]} />
      </div>
      <div className="chips">{flag('hoy', 'Con actividad hoy')}{flag('vencidos', 'Vencidos')}{flag('bloqueados', 'Bloqueados')}{flag('detenidas', `Más de ${m.rules.inprog} d en curso`)}{flag('qa', 'Pendientes de QA')}{flag('idavuelta', 'Ida y vuelta de estado')}{flag('sprint', 'Sprint activo')}{flag('completados30', 'Completados 30 d')}</div>
      <div className="legend" aria-label="Colores de estado">{TONE_LABEL.map(([t, l]) => <span key={t}><i className={`st-dot st-${t}`} />{l}</span>)}</div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr>{ts.th('key', 'Clave')}{ts.th('sum', 'Resumen')}{ts.th('proj', 'Proyecto')}{ts.th('dev', 'Responsable')}{ts.th('status', 'Estado')}{ts.th('days', 'En estado', { num: true, cls: 'r' })}{ts.th('prio', 'Prioridad', { num: true })}{ts.th('sp', 'SP', { num: true, cls: 'r' })}{ts.th('due', 'Vence', { cls: 'r' })}{ts.th('act', 'Última actividad', { num: true })}</tr></thead>
        <tbody>{ts.sorted.length ? ts.sorted.slice(0, 400).map((i) => (
          <tr className="click" key={i.key} onClick={() => open(i.key)}>
            <td><KeyLink i={i} /></td>
            <td className="sum"><div className="clamp">{i.summary}</div><div className="small muted">{i.type}{i.versions.length ? ` · ${i.versions.join(', ')}` : ''}</div></td>
            <td className="small">{i.project.key}</td>
            <td><PersonTag name={i.assignee} avatars={m.avatars} /></td>
            <td><StatusPill i={i} />{i.blocked ? <> <span className="pill crit">bloqueado</span></> : i.blockInfer ? <> <span className="pill warn">posible bloqueo</span></> : null}</td>
            <td className={`r ${i.stale ? '' : 'muted'}`}>{daysTxt(i.daysInStatus)}</td>
            <td className="small">{i.priority}</td><td className="r">{i.sp ?? '—'}</td>
            <td className="r small">{i.due ? <span style={i.overdue ? { color: 'var(--crit)', fontWeight: 600 } : undefined}>{fS(i.due)}</span> : '—'}</td>
            <td className="small act-cell" title={`Última actividad: ${i.lastActivityKind}`}><span className="num">{fS(i.lastActivity)} · {fH(i.lastActivity)}</span><PersonTag name={i.lastActivityBy} avatars={m.avatars} /><span className="muted">{i.lastActivityKind}</span></td>
          </tr>
        )) : <tr><td colSpan={10} className="empty">Nada coincide con estos filtros.</td></tr>}</tbody>
      </table></div>
    </section>
  );
}

/* ───────── Despliegues ───────── */
type DGroup = 'dia' | 'ambiente' | 'proyecto' | 'tipo' | 'persona';
const ENV_ORDER = { PRD: 0, QA: 1, DEV: 2 } as const;
export function Despliegues({ m, byKey, open, init }: Ctx & { init?: { env: 'todos' | 'DEV' | 'QA' | 'PRD'; days: number } }) {
  const [env, setEnv] = useState<'todos' | 'DEV' | 'QA' | 'PRD'>(init?.env ?? 'todos');
  const [days, setDays] = useState(init?.days ?? 30);
  const [q, setQ] = useState('');
  const [proj, setProj] = useState('');
  const [who, setWho] = useState('');
  const [type, setType] = useState('');
  const [by, setBy] = useState<DGroup>('dia');
  const inRange = useMemo(() => m.deploys.filter((d) => m.ref - d.at <= days * DAY), [m, days]);
  const projs = useMemo(() => uniq(inRange.map((d) => byKey.get(d.key)!.project.key)), [inRange, byKey]);
  const whos = useMemo(() => uniq(inRange.map((d) => d.by)), [inRange]);
  const types = useMemo(() => uniq(inRange.map((d) => byKey.get(d.key)!.type)), [inRange, byKey]);
  const list = useMemo(() => inRange.filter((d) => {
    const i = byKey.get(d.key)!;
    if (env !== 'todos' && d.env !== env) return false;
    if (proj && i.project.key !== proj) return false;
    if (who && d.by !== who) return false;
    if (type && i.type !== type) return false;
    return matches(q, i.key, i.summary, i.versions.join(' '));
  }), [inRange, byKey, env, proj, who, type, q]);
  const count = (e: string) => inRange.filter((d) => d.env === e).length;

  const groups = useMemo(() => {
    const keyOf = (d: Deploy): string => {
      const i = byKey.get(d.key)!;
      return by === 'dia' ? dayOf(d.at) : by === 'ambiente' ? d.env : by === 'proyecto' ? i.project.key : by === 'tipo' ? i.type || 'Sin tipo' : d.by;
    };
    const map = new Map<string, Deploy[]>();
    for (const d of list) { const k = keyOf(d); if (!map.has(k)) map.set(k, []); map.get(k)!.push(d); }
    let entries = [...map.entries()];
    if (by === 'ambiente') entries.sort((a, b) => ENV_ORDER[a[0] as keyof typeof ENV_ORDER] - ENV_ORDER[b[0] as keyof typeof ENV_ORDER]);
    else if (by !== 'dia') entries = entries.sort((a, b) => b[1].length - a[1].length);
    return entries.map(([k, arr]) => {
      const i = byKey.get(arr[0].key)!;
      const label = by === 'dia' ? relDayLabel(arr[0].at) : by === 'ambiente' ? `Ambiente ${k}` : by === 'proyecto' ? `${k} · ${i.project.name}` : k;
      return { k, label, arr };
    });
  }, [list, by, byKey]);

  return (
    <section className="section">
      <div className="section-head"><h2>Bitácora de despliegues</h2><span className="count-line num">DEV {count('DEV')} · QA {count('QA')} · PRD {count('PRD')} en {days} días</span></div>
      <div className="banner info"><p>Cada entrada es una transición hacia un estado de ambiente (DEV, QA o PRD) según las expresiones configuradas en Vercel. Jira no registra el resultado del pipeline ni la hora real del despliegue: para eso hace falta integrar la fuente de CI/CD.</p></div>
      <div className="chips">
        {(['todos', 'DEV', 'QA', 'PRD'] as const).map((e) => <Chip key={e} on={env === e} onClick={() => setEnv(e)}>{e === 'todos' ? 'Todos los ambientes' : e}</Chip>)}
        <span style={{ width: 12 }} />
        {[7, 30, 90].map((d) => <Chip key={d} on={days === d} onClick={() => setDays(d)}>{d} días</Chip>)}
      </div>
      <div className="filters">
        <SearchField id="dp-q" value={q} onChange={setQ} placeholder="Clave, resumen o versión" />
        <SelectField id="dp-proj" label="Proyecto" value={proj} onChange={setProj} options={projs} />
        <SelectField id="dp-type" label="Tipo de issue" value={type} onChange={setType} options={types} />
        <SelectField id="dp-who" label="Movido por" value={who} onChange={setWho} options={whos} />
        <SelectField id="dp-by" label="Agrupar por" value={by} onChange={(v) => setBy(v as DGroup)} all={null} options={[['dia', 'Día'], ['ambiente', 'Ambiente'], ['proyecto', 'Proyecto'], ['tipo', 'Tipo de issue'], ['persona', 'Persona']]} />
      </div>
      <div className="panel list-scroll">
        {groups.length ? groups.map((g) => (
          <div key={g.k}>
            <div className="grp-h"><span>{g.label}</span><span className="n">{g.arr.length}</span></div>
            {g.arr.map((d, n) => { const i = byKey.get(d.key)!; return (
              <div className={`dep click${by === 'dia' ? '' : ' wide-time'}`} key={n} role="button" tabIndex={0} onClick={() => open(d.key)} onKeyDown={(e) => { if (e.key === 'Enter') open(d.key); }} style={{ cursor: 'pointer' }}>
                <span className="time">{by === 'dia' ? fH(d.at) : <>{fS(d.at)} · {fH(d.at)}</>}</span><span><EnvChip env={d.env} /></span>
                <div className="body">
                  <div className="line1"><KeyLink i={i} /> <span className="clamp" style={{ minWidth: 0 }}>{i.summary}</span></div>
                  <div className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span>{i.project.key} · {i.type}</span><PersonTag name={d.by} avatars={m.avatars} /><span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}><StatusTag name={d.from || '—'} /> → <StatusTag name={d.to} />{i.versions.length ? ` · versión ${i.versions.join(', ')}` : ''}</span></div>
                  {d.after.length > 0 && <div className="small" style={{ color: 'var(--warn)' }}>Bugs creados en {i.project.key} en las 72 h siguientes: {d.after.join(', ')} <KindTag kind="Inferencia" /></div>}
                </div>
              </div>
            ); })}
          </div>
        )) : <div className="empty">No hay despliegues con estos filtros. Si tus estados se llaman distinto, ajusta DEPLOY_REGEX_* en Vercel.</div>}
      </div>
    </section>
  );
}

/* ───────── Comentarios ───────── */
export function Comentarios({ m, open }: Ctx) {
  const [days, setDays] = useState(7);
  const [tag, setTag] = useState('');
  const [proj, setProj] = useState('');
  const [author, setAuthor] = useState('');
  const [q, setQ] = useState('');
  const all = useMemo(() => {
    const out: { i: Issue; c: Issue['comments'][number]; tags: string[] }[] = [];
    const now = Date.now();
    for (const i of m.issues) for (const c of i.comments) if (now - c.at <= days * DAY) out.push({ i, c, tags: tagsOf(c.text) });
    return out.sort((a, b) => b.c.at - a.c.at);
  }, [m, days]);
  const projs = useMemo(() => uniq(all.map((x) => x.i.project.key)), [all]);
  const authors = useMemo(() => uniq(all.map((x) => x.c.by)), [all]);
  const list = all.filter((x) => (!tag || x.tags.includes(tag)) && (!proj || x.i.project.key === proj) && (!author || x.c.by === author) && matches(q, x.i.key, x.i.summary, x.c.text));
  const groups = useMemo(() => {
    const map = new Map<string, typeof list>();
    for (const x of list.slice(0, 300)) { const k = dayOf(x.c.at); if (!map.has(k)) map.set(k, []); map.get(k)!.push(x); }
    return [...map.entries()];
  }, [list]);
  return (
    <section className="section">
      <div className="section-head"><h2>Comentarios</h2><Count n={list.length} total={all.length} what={`comentarios en ${days} días`} /></div>
      <div className="filters">
        <SearchField id="cf-q" value={q} onChange={setQ} placeholder="Texto, clave o resumen" />
        <SelectField id="cf-days" label="Periodo" value={String(days)} onChange={(v) => setDays(Number(v))} all={null} options={[1, 3, 7, 14, 30].map((d) => [String(d), d === 1 ? 'Hoy' : `Últimos ${d} días`] as [string, string])} />
        <SelectField id="cf-proj" label="Proyecto" value={proj} onChange={setProj} options={projs} />
        <SelectField id="cf-author" label="Autor" value={author} onChange={setAuthor} options={authors} />
      </div>
      <div className="chips">
        <Chip on={!tag} onClick={() => setTag('')}>Todos</Chip>
        {TAGS.map(([t]) => <Chip key={t} on={tag === t} onClick={() => setTag(t)}>{t[0].toUpperCase() + t.slice(1)} ({all.filter((x) => x.tags.includes(t)).length})</Chip>)}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Toca un comentario para ver a la derecha el historial completo de la incidencia. Las etiquetas salen de palabras clave en el texto (inferencia).</p>
      <div className="panel list-scroll">
        {groups.length ? groups.map(([k, arr]) => (
          <div key={k}>
            <div className="grp-h"><span>{relDayLabel(arr[0].c.at)}</span><span className="n">{arr.length}</span></div>
            {arr.map(({ i, c, tags }, n) => (
              <div className="cmt click" key={n} role="button" tabIndex={0} onClick={() => open(i.key)} onKeyDown={(e) => { if (e.key === 'Enter') open(i.key); }}>
                <div className="h"><KeyLink i={i} /> <span className="muted">{clip(i.summary, 80)}</span> <StatusPill i={i} /></div>
                <div className="h"><PersonTag name={c.by} avatars={m.avatars} /><span className="muted">{fH(c.at)}</span>{tags.map((t) => <span key={t} className={`pill ${t === 'riesgo' || t === 'problema' ? 'warn' : t === 'intervención' ? 'crit' : 'info'}`}>{t}</span>)}</div>
                <div className="txt">{clip(c.text, 600)}</div>
              </div>
            ))}
          </div>
        )) : <div className="empty">No hay comentarios con estos filtros.</div>}
      </div>
      {list.length > 300 && <p className="small muted" style={{ margin: 0 }}>Se muestran los 300 más recientes. Acota con los filtros para ver el resto.</p>}
    </section>
  );
}

