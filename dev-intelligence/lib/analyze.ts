import 'server-only';
import type { Alert, BlockFact, Cat, Deploy, EnvName, Issue, IssueComment, Model, Person, ProjectStat, Rules, SprintStat, Stopper, Week } from './types';
import { BLOCK_TXT, DAY, UNBLOCK_TXT, clip, median, prioRank, r1 } from './rules';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

/* ───────── Atlassian Document Format → texto ───────── */
function adf(n: Raw): string {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(adf).join('');
  switch (n.type) {
    case 'text': return n.text || '';
    case 'mention': return n.attrs?.text || '@usuario';
    case 'hardBreak': return '\n';
    case 'emoji': return n.attrs?.text || '';
    case 'inlineCard': return n.attrs?.url || '';
  }
  const inner = adf(n.content || []);
  return ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(n.type) ? inner + '\n' : inner;
}
function mentionsOf(n: Raw, out: string[] = []): string[] {
  if (!n || typeof n !== 'object') return out;
  if (Array.isArray(n)) { n.forEach((x) => mentionsOf(x, out)); return out; }
  if (n.type === 'mention' && n.attrs?.text) out.push(String(n.attrs.text).replace(/^@/, ''));
  if (n.content) mentionsOf(n.content, out);
  return out;
}
const ms = (v: unknown): number | null => {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
};
const safeRe = (src: string) => { try { return new RegExp(src, 'i'); } catch { return /$^/; } };

/* ───────── detección de campos personalizados ───────── */
interface Fields { sp?: string; sprint?: string; flagged?: string; flaggedName: string }
function detectFields(names: Record<string, string>, raw: Raw[]): Fields {
  const ids = Object.keys(names || {});
  const find = (re: RegExp) => ids.find((k) => re.test(names[k]));
  const F: Fields = {
    sp: find(/^story points?$/i) || find(/story point estimate/i) || find(/story point/i) || find(/puntos de historia/i),
    sprint: find(/^sprint$/i),
    flagged: find(/^flagged$/i) || find(/^marcad/i) || find(/^impediment/i),
    flaggedName: 'Flagged',
  };
  if (!F.sprint) {
    outer: for (const it of raw.slice(0, 200)) for (const [k, v] of Object.entries(it.fields || {})) {
      const first = Array.isArray(v) ? (v[0] as Raw) : null;
      if (first && typeof first === 'object' && 'state' in first && ('boardId' in first || 'startDate' in first)) { F.sprint = k; break outer; }
    }
  }
  if (F.flagged) F.flaggedName = names[F.flagged] || 'Flagged';
  return F;
}

/* ───────── normalización de un issue ───────── */
function normalize(it: Raw, F: Fields, site: string) {
  const f = it.fields || {};
  const st = f.status || {};
  const hist = [...(it.changelog?.histories || [])].sort((a: Raw, b: Raw) => (ms(a.created) || 0) - (ms(b.created) || 0));
  const transitions: Issue['transitions'] = [];
  let flaggedAt: number | null = null;
  for (const h of hist) for (const x of h.items || []) {
    const at = ms(h.created);
    if (!at) continue;
    if (x.field === 'status') transitions.push({ at, by: h.author?.displayName || '—', from: x.fromString || '', to: x.toString || '' });
    else if ((x.field === F.flaggedName || /^flagged$|^marcad/i.test(x.field || '')) && x.toString) flaggedAt = at;
  }
  const comments: IssueComment[] = (f.comment?.comments || [])
    .map((c: Raw) => ({ at: ms(c.created) || 0, by: c.author?.displayName || '—', text: clip(adf(c.body).trim(), 1500), mentions: mentionsOf(c.body) }))
    .filter((c: IssueComment) => c.at)
    .sort((a: IssueComment, b: IssueComment) => a.at - b.at);
  const sp0 = F.sp ? f[F.sp] : null;
  const sprints = ([] as Raw[]).concat(F.sprint ? f[F.sprint] || [] : [])
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({ id: s.id ?? s.name, name: s.name || 'Sprint', state: String(s.state || '').toLowerCase(), start: ms(s.startDate), end: ms(s.endDate) }));
  const fv = F.flagged ? f[F.flagged] : null;
  const links = (f.issuelinks || []).map((l: Raw) => {
    const o = l.inwardIssue || l.outwardIssue;
    const dir: 'in' | 'out' = l.inwardIssue ? 'in' : 'out';
    return { type: l.type?.name || '', phrase: (dir === 'in' ? l.type?.inward : l.type?.outward) || '', dir, key: o?.key || '', summary: o?.fields?.summary || '', status: o?.fields?.status?.name || '', cat: o?.fields?.status?.statusCategory?.key || '' };
  }).filter((l: { key: string }) => l.key);
  const cat = (['new', 'indeterminate', 'done'].includes(st.statusCategory?.key) ? st.statusCategory.key : 'new') as Cat;
  return {
    key: String(it.key),
    url: `${site}/browse/${it.key}`,
    summary: f.summary || '',
    project: { key: f.project?.key || String(it.key).split('-')[0], name: f.project?.name || '' },
    type: f.issuetype?.name || '',
    status: st.name || '',
    cat,
    priority: f.priority?.name || '—',
    prio: prioRank(f.priority?.name),
    assignee: f.assignee?.displayName || 'Sin asignar',
    reporter: f.reporter?.displayName || '—',
    created: ms(f.created), updated: ms(f.updated), resolved: ms(f.resolutiondate),
    due: f.duedate ? ms(f.duedate + 'T23:59:59-05:00') : null,
    labels: Array.isArray(f.labels) ? f.labels : [],
    sp: typeof sp0 === 'number' && Number.isFinite(sp0) ? sp0 : null,
    sprints,
    flagged: Array.isArray(fv) ? fv.length > 0 : !!fv,
    flaggedAt, links, comments, transitions,
    versions: (f.fixVersions || []).map((v: Raw) => v.name),
    parent: f.parent?.key || null,
    description: clip(adf(f.description).trim(), 1500),
  };
}

/* ───────── semana (lunes, hora de Bogotá) ───────── */
const OFF = 5 * 3600e3;
const mondayOf = (t: number) => {
  const d = new Date(t - OFF);
  d.setUTCHours(0, 0, 0, 0);
  const wd = (d.getUTCDay() + 6) % 7;
  return d.getTime() - wd * DAY + OFF;
};

/* ───────── modelo completo ───────── */
export function buildModel(raw: Raw[], names: Record<string, string>, o: { site: string; jql: string; truncated: boolean; rules: Rules }): Model {
  const R = o.rules;
  const RE = { PRD: safeRe(R.prd), QA: safeRe(R.qa), DEV: safeRe(R.dev), block: safeRe(R.block) };
  const envOf = (s: string): EnvName | null => (!s ? null : RE.PRD.test(s) ? 'PRD' : RE.QA.test(s) ? 'QA' : RE.DEV.test(s) ? 'DEV' : null);
  const F = detectFields(names, raw);
  const now = Date.now();

  const issues: Issue[] = raw.map((it) => {
    const b = normalize(it, F, o.site);
    const lastT = b.transitions.at(-1);
    const statusSince = lastT?.at ?? b.created;
    const seen = new Set([b.transitions[0]?.from].filter(Boolean));
    let backMoves = 0;
    for (const t of b.transitions) { if (seen.has(t.to)) backMoves++; seen.add(t.to); }
    const open = b.cat !== 'done';
    const lastComment = b.comments.at(-1) || null;
    const lastActivity = Math.max(b.created || 0, lastT?.at || 0, lastComment?.at || 0);
    const env = envOf(b.status);
    const facts: BlockFact[] = [];
    if (open) {
      if (b.flagged) facts.push({ why: 'Marcado como impedimento (flag)', since: b.flaggedAt || statusSince, who: null });
      if (RE.block.test(b.status)) facts.push({ why: `Estado «${b.status}»`, since: statusSince, who: null });
      const lb = b.labels.find((l: string) => RE.block.test(l));
      if (lb) facts.push({ why: `Etiqueta «${lb}»`, since: null, who: null });
      for (const l of b.links) if (l.dir === 'in' && (/block/i.test(l.type) || /blocked by|bloquead/i.test(l.phrase)) && l.cat !== 'done') facts.push({ why: `Bloqueado por ${l.key}${l.status ? ` (${l.status})` : ''}`, since: null, who: `Responsable de ${l.key}` });
    }
    let blockInfer: Issue['blockInfer'] = null;
    if (open && !facts.length) {
      const recent = b.comments.filter((c) => now - c.at <= 14 * DAY && BLOCK_TXT.test(c.text));
      const last = recent.at(-1);
      if (last && !(lastComment && lastComment.at > last.at && UNBLOCK_TXT.test(lastComment.text))) blockInfer = { why: 'Un comentario reciente sugiere bloqueo', since: last.at, comment: last };
    }
    const daysInStatus = statusSince ? (now - statusSince) / DAY : null;
    const stale = b.cat === 'indeterminate' && !env && (daysInStatus ?? 0) >= R.inprog;
    return {
      ...b, statusSince, daysInStatus, backMoves, open,
      overdue: !!(open && b.due && b.due < now), env, lastActivity,
      activeSprint: b.sprints.find((s) => s.state === 'active')?.name || null,
      blockFacts: facts, blockInfer, blocked: facts.length > 0, stale,
      quiet: open && b.cat === 'indeterminate' && (now - lastActivity) / DAY >= R.stale,
    };
  });
  const byKey = new Map(issues.map((i) => [i.key, i]));

  /* stoppers */
  const critRank = { Alta: 0, Media: 1, Baja: 2 } as const;
  const stoppers: Stopper[] = issues.filter((i) => i.blockFacts.length || i.blockInfer).map((i) => {
    const kind = i.blockFacts.length ? 'hecho' as const : 'inferencia' as const;
    const reasons = i.blockFacts.length ? i.blockFacts.map((f) => f.why) : [i.blockInfer!.why];
    const since = i.blockFacts.map((f) => f.since).filter((x): x is number => !!x).sort((a, b) => a - b)[0] ?? i.blockInfer?.since ?? i.statusSince;
    const elapsed = since ? (now - since) / DAY : null;
    const lc = i.blockInfer?.comment || i.comments.at(-1) || null;
    let resolver = i.blockFacts.map((f) => f.who).filter(Boolean).join(', ');
    if (!resolver && lc?.mentions.length) resolver = lc.mentions.join(', ') + ' (mencionado)';
    if (!resolver) resolver = `${i.reporter} (reportó el issue)`;
    const score = i.prio + ((elapsed ?? 0) > 7 ? 2 : (elapsed ?? 0) > 3 ? 1 : 0) + (i.activeSprint ? 1 : 0) + (kind === 'hecho' ? 0 : -1);
    const crit = score >= 6 ? 'Alta' as const : score >= 4 ? 'Media' as const : 'Baja' as const;
    return { key: i.key, kind, reasons, since, elapsed, resolver, crit, last: lc };
  }).sort((a, b) => critRank[a.crit] - critRank[b.crit] || (b.elapsed || 0) - (a.elapsed || 0));

  /* despliegues: transiciones hacia estados de ambiente */
  const deploys: Deploy[] = [];
  for (const i of issues) for (const t of i.transitions) { const e = envOf(t.to); if (e) deploys.push({ at: t.at, env: e, key: i.key, by: t.by, from: t.from, to: t.to, after: [] }); }
  deploys.sort((a, b) => b.at - a.at);
  const bugs = issues.filter((i) => /bug|error|incidente|defecto|falla/i.test(i.type));
  for (const d of deploys) if (d.env === 'PRD') {
    const pk = byKey.get(d.key)!.project.key;
    d.after = bugs.filter((b) => b.key !== d.key && b.project.key === pk && b.created && b.created > d.at && b.created - d.at <= 3 * DAY).map((b) => b.key);
  }

  /* equipo */
  const people = new Map<string, Person & { res: number[] }>();
  const P = (n: string) => {
    if (!people.has(n)) people.set(n, { name: n, open: 0, inprog: 0, spOpen: 0, overdue: 0, blocked: 0, stale: 0, done30: 0, spDone30: 0, medRes: null, last: null, keys: [], res: [] });
    return people.get(n)!;
  };
  for (const i of issues) {
    const p = P(i.assignee);
    if (i.open) { p.open++; p.keys.push(i.key); if (i.cat === 'indeterminate') p.inprog++; p.spOpen += i.sp || 0; if (i.overdue) p.overdue++; if (i.blocked) p.blocked++; if (i.stale) p.stale++; }
    if (i.resolved && now - i.resolved <= 30 * DAY) { p.done30++; p.spDone30 += i.sp || 0; }
    if (i.resolved && i.created && now - i.resolved <= 90 * DAY) p.res.push((i.resolved - i.created) / DAY);
  }
  for (const i of issues) {
    for (const t of i.transitions) { const p = people.get(t.by); if (p && (!p.last || t.at > p.last)) p.last = t.at; }
    for (const c of i.comments) { const p = people.get(c.by); if (p && (!p.last || c.at > p.last)) p.last = c.at; }
  }
  const team: Person[] = [...people.values()].filter((p) => p.open || p.done30).map(({ res, ...p }) => ({ ...p, medRes: r1(median(res)) })).sort((a, b) => b.spOpen - a.spOpen || b.open - a.open);
  const hasSP = issues.some((i) => i.sp != null);

  /* proyectos */
  const pm = new Map<string, ProjectStat>();
  for (const i of issues) {
    const k = i.project.key;
    if (!pm.has(k)) pm.set(k, { key: k, name: i.project.name, total: 0, open: 0, inprog: 0, overdue: 0, blocked: 0, stale: 0, done30: 0, oldest: 0, delay: 0 });
    const p = pm.get(k)!; p.total++;
    if (i.open) { p.open++; if (i.cat === 'indeterminate') p.inprog++; if (i.overdue) p.overdue++; if (i.blocked) p.blocked++; if (i.stale) p.stale++; if (i.created) p.oldest = Math.max(p.oldest, (now - i.created) / DAY); }
    if (i.resolved && now - i.resolved <= 30 * DAY) p.done30++;
  }
  const projects = [...pm.values()].map((p) => ({ ...p, delay: p.overdue * 2 + p.blocked * 2 + p.stale })).sort((a, b) => b.delay - a.delay || b.open - a.open);

  /* sprints activos */
  const sm = new Map<string | number, { id: string | number; name: string; start: number | null; end: number | null; items: Issue[] }>();
  for (const i of issues) for (const s of i.sprints) if (s.state === 'active') { if (!sm.has(s.id)) sm.set(s.id, { ...s, items: [] }); sm.get(s.id)!.items.push(i); }
  const sprints: SprintStat[] = [...sm.values()].map((s) => {
    const done = s.items.filter((i) => i.cat === 'done');
    const spT = s.items.reduce((a, i) => a + (i.sp || 0), 0), spD = done.reduce((a, i) => a + (i.sp || 0), 0);
    const elapsed = s.start && s.end ? Math.min(1, Math.max(0, (now - s.start) / (s.end - s.start))) : null;
    const prog = spT > 0 ? spD / spT : s.items.length ? done.length / s.items.length : 0;
    return { id: s.id, name: s.name, start: s.start, end: s.end, total: s.items.length, done: done.length, spT, spD, elapsed, prog, blocked: s.items.filter((i) => i.blocked).length, daysLeft: s.end ? Math.ceil((s.end - now) / DAY) : null, gap: elapsed != null ? elapsed - prog : null, keys: s.items.map((i) => i.key) };
  }).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));

  /* evolución semanal */
  const w0 = mondayOf(now - 11 * 7 * DAY);
  const weeks: Week[] = Array.from({ length: 12 }, (_, k) => ({ start: w0 + k * 7 * DAY, created: 0, resolved: 0, prd: 0 }));
  const wi = (t: number | null) => { if (!t) return -1; const k = Math.floor((t - w0) / (7 * DAY)); return k >= 0 && k < 12 ? k : -1; };
  for (const i of issues) { let k = wi(i.created); if (k >= 0) weeks[k].created++; k = wi(i.resolved); if (k >= 0) weeks[k].resolved++; }
  for (const d of deploys) if (d.env === 'PRD') { const k = wi(d.at); if (k >= 0) weeks[k].prd++; }

  /* KPIs */
  const open = issues.filter((i) => i.open);
  const res30 = issues.filter((i) => i.resolved && now - i.resolved <= 30 * DAY);
  const kpi = {
    total: issues.length, open: open.length, inprog: open.filter((i) => i.cat === 'indeterminate').length,
    blocked: stoppers.filter((s) => s.kind === 'hecho').length, blockedInf: stoppers.filter((s) => s.kind === 'inferencia').length,
    overdue: open.filter((i) => i.overdue).length, done30: res30.length,
    medRes30: r1(median(res30.filter((i) => i.created).map((i) => (i.resolved! - i.created!) / DAY))),
    prd7: deploys.filter((d) => d.env === 'PRD' && now - d.at <= 7 * DAY).length,
    stale: open.filter((i) => i.stale).length,
  };

  /* alertas por reglas */
  const alerts: Alert[] = [];
  const keys = (arr: Issue[]) => arr.map((i) => i.key);
  const altas = stoppers.filter((s) => s.crit === 'Alta');
  if (altas.length) alerts.push({ sev: 'crit', kind: altas.every((s) => s.kind === 'hecho') ? 'Hecho' : 'Inferencia', title: `${altas.length} ${altas.length === 1 ? 'stopper de criticidad alta' : 'stoppers de criticidad alta'}`, detail: altas.slice(0, 3).map((s) => `${s.key}: ${s.reasons[0]} · ${Math.floor(s.elapsed || 0)} d`).join(' · '), keys: altas.map((s) => s.key) });
  for (const s of sprints) if (s.gap != null && s.gap > 0.2) alerts.push({ sev: s.gap > 0.35 ? 'crit' : 'warn', kind: 'Hecho', title: `${s.name}: avance ${Math.round(s.prog * 100)}% con ${Math.round((s.elapsed || 0) * 100)}% del tiempo transcurrido`, detail: `${s.done}/${s.total} issues finalizados${s.spT ? `, ${s.spD}/${s.spT} SP` : ''}. Quedan ${s.daysLeft} días.${s.blocked ? ` ${s.blocked} bloqueados.` : ''}`, keys: s.keys.filter((k) => byKey.get(k)?.open) });
  const od = open.filter((i) => i.overdue).sort((a, b) => (a.due || 0) - (b.due || 0));
  if (od.length) alerts.push({ sev: od.length >= 5 ? 'crit' : 'warn', kind: 'Hecho', title: `${od.length} ${od.length === 1 ? 'issue vencido' : 'issues vencidos'}`, detail: `El más antiguo venció hace ${Math.floor((now - (od[0].due || now)) / DAY)} días.`, keys: keys(od) });
  const st = open.filter((i) => i.stale && i.quiet && !i.blocked).sort((a, b) => (b.daysInStatus || 0) - (a.daysInStatus || 0));
  if (st.length) alerts.push({ sev: 'warn', kind: 'Inferencia', title: `${st.length} ${st.length === 1 ? 'tarea' : 'tareas'} en curso más de ${R.inprog} días y sin actividad en ${R.stale} días`, detail: 'No hay bloqueo registrado. Conviene confirmar el estado con el responsable antes de concluir que está detenida.', keys: keys(st) });
  const basis = hasSP ? 'spOpen' : 'open';
  const act = team.filter((p) => p.name !== 'Sin asignar' && p[basis] > 0);
  if (act.length >= 3) {
    const mean = act.reduce((a, p) => a + p[basis], 0) / act.length;
    for (const p of act.filter((x) => x[basis] > mean * 1.6)) alerts.push({ sev: 'warn', kind: 'Inferencia', title: `${p.name} concentra ${hasSP ? `${p.spOpen} SP abiertos` : `${p.open} issues abiertos`} (promedio ${r1(mean)})`, detail: 'Posible desbalance de carga. Revisa prioridad y complejidad antes de redistribuir.', keys: p.keys });
  }
  const unassigned = open.filter((i) => i.assignee === 'Sin asignar' && i.cat !== 'new');
  if (unassigned.length) alerts.push({ sev: 'warn', kind: 'Hecho', title: `${unassigned.length} ${unassigned.length === 1 ? 'issue en curso' : 'issues en curso'} sin responsable`, detail: 'Están en un estado de trabajo pero no tienen asignado.', keys: keys(unassigned) });
  const pp = issues.filter((i) => i.backMoves >= 2 && now - i.lastActivity <= 30 * DAY).sort((a, b) => b.backMoves - a.backMoves);
  if (pp.length) alerts.push({ sev: 'info', kind: 'Hecho', title: `${pp.length} ${pp.length === 1 ? 'issue con' : 'issues con'} cambios de estado de ida y vuelta`, detail: 'Volvieron a un estado anterior dos o más veces. Suele indicar criterios de aceptación poco claros o devoluciones de QA.', keys: keys(pp) });
  const badPrd = deploys.filter((d) => d.env === 'PRD' && d.after.length && now - d.at <= 30 * DAY);
  if (badPrd.length) alerts.push({ sev: 'warn', kind: 'Inferencia', title: `${badPrd.length} ${badPrd.length === 1 ? 'paso' : 'pasos'} a producción seguidos de bugs en menos de 72 h`, detail: 'Bugs creados en el mismo proyecto poco después; la relación causal no está confirmada.', keys: [...new Set(badPrd.map((d) => d.key))] });
  const sevRank = { crit: 0, warn: 1, info: 2 } as const;
  alerts.sort((a, b) => sevRank[a.sev] - sevRank[b.sev]);

  return {
    ref: now, site: o.site, jql: o.jql, truncated: o.truncated,
    fields: { sp: F.sp, sprint: F.sprint, flagged: F.flagged }, hasSP, rules: R,
    kpi, alerts, stoppers, deploys, team, projects, sprints, weeks, issues,
  };
}
