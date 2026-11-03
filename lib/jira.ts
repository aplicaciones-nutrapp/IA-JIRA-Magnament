import 'server-only';
import { buildModel } from './analyze';
import { DEFAULT_JQL, cacheSeconds, defaultGroupName, env, maxPages, normName, rules, teamGroups, type TeamGroup } from './env';
import type { Model } from './types';

export class JiraError extends Error {
  constructor(public status: number, message: string, public detail?: string) {
    super(message);
  }
}

function conn() {
  const site = env('JIRA_SITE').replace(/\/+$/, '');
  const auth = Buffer.from(`${env('JIRA_EMAIL')}:${env('JIRA_API_TOKEN')}`).toString('base64');
  return { site, headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } };
}

async function jiraErrorFrom(res: Response): Promise<JiraError> {
  let detail = '';
  try {
    const j = await res.json();
    detail = [...(j.errorMessages || []), ...Object.values(j.errors || {})].join(' · ');
  } catch { /* cuerpo sin JSON */ }
  const msg =
    res.status === 401 ? 'Jira rechazó las credenciales. Revisa JIRA_EMAIL y JIRA_API_TOKEN.' :
    res.status === 403 ? 'La cuenta no tiene permiso para esta consulta en Jira.' :
    res.status === 400 ? 'Jira no aceptó el JQL.' :
    res.status === 429 ? 'Jira limitó las consultas por exceso de peticiones. Intenta en un minuto.' :
    `Jira respondió con error ${res.status}.`;
  return new JiraError(res.status, msg, detail || undefined);
}

/** Búsqueda paginada con el endpoint vigente /rest/api/3/search/jql (paginación por nextPageToken). */
export async function searchJql(jql: string, opts: { pages?: number; signal?: AbortSignal } = {}) {
  const { site, headers } = conn();
  const pages = opts.pages ?? maxPages();
  const issues: unknown[] = [];
  const names: Record<string, string> = {};
  let token: string | undefined;
  let truncated = false;
  for (let p = 0; p < pages; p++) {
    const q = new URLSearchParams({ jql, fields: '*navigable,comment', expand: 'changelog,names', maxResults: '100' });
    if (token) q.set('nextPageToken', token);
    let res = await fetch(`${site}/rest/api/3/search/jql?${q}`, { headers, cache: 'no-store', signal: opts.signal });
    if (res.status === 429) {
      const wait = Math.min(10, Number(res.headers.get('retry-after')) || 3);
      await new Promise((r) => setTimeout(r, wait * 1000));
      res = await fetch(`${site}/rest/api/3/search/jql?${q}`, { headers, cache: 'no-store', signal: opts.signal });
    }
    if (!res.ok) throw await jiraErrorFrom(res);
    const j = await res.json();
    issues.push(...(j.issues || []));
    Object.assign(names, j.names || {});
    if (j.isLast || !j.nextPageToken) { token = undefined; break; }
    token = j.nextPageToken;
    if (p === pages - 1) truncated = true;
  }
  return { issues, names, truncated, site };
}

/* ───────── grupos de responsables ───────── */
export class GroupError extends Error {
  constructor(public group: string) {
    super(`El grupo «${group}» no existe en TEAM_GROUPS.`);
  }
}

/** null o '' = grupo por defecto (TEAM_DEFAULT_GROUP); '*' = todos los responsables. */
export function resolveGroup(name: string | null | undefined): TeamGroup | null {
  const groups = teamGroups();
  const wanted = name == null || name === '' ? defaultGroupName() : name;
  if (!wanted || wanted === '*') return null;
  const g = groups.find((x) => normName(x.name) === normName(wanted));
  if (!g) throw new GroupError(wanted);
  return g;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function filterByGroup(issues: any[], g: TeamGroup) {
  const toks = g.members.map((m) => ({ raw: m, n: normName(m) }));
  const hit = new Set<number>();
  const accountIds = new Set<string>();
  const out = issues.filter((it) => {
    const a = it.fields?.assignee;
    if (!a) return false;
    const dn = normName(a.displayName || '');
    const em = normName(a.emailAddress || '');
    const idx = toks.findIndex((t) => t.raw === a.accountId || t.n === dn || (em !== '' && t.n === em));
    if (idx < 0) return false;
    hit.add(idx);
    if (a.accountId) accountIds.add(a.accountId);
    return true;
  });
  return { issues: out, missing: g.members.filter((_, k) => !hit.has(k)), accountIds: [...accountIds] };
}

/* ───────── caché en memoria de la instancia ───────── */
interface RawCache { at: number; issues: any[]; names: Record<string, string>; truncated: boolean; site: string; jql: string }
let raw: RawCache | null = null;
let inflight: Promise<RawCache> | null = null;
const models = new Map<string, Model>();

async function getRaw(force: boolean): Promise<RawCache> {
  if (!force && raw && Date.now() - raw.at < cacheSeconds() * 1000) return raw;
  if (inflight) return inflight;
  inflight = (async () => {
    const jql = env('JIRA_JQL', DEFAULT_JQL);
    const r = await searchJql(jql);
    raw = { at: Date.now(), jql, ...r };
    models.clear();
    return raw;
  })().finally(() => { inflight = null; });
  return inflight;
}

export async function getModel(force = false, group?: string | null): Promise<Model> {
  const g = resolveGroup(group);
  const r = await getRaw(force);
  const key = g?.name ?? '*';
  const cached = models.get(key);
  if (cached && cached.ref === r.at) return cached;
  const f = g ? filterByGroup(r.issues, g) : { issues: r.issues, missing: [], accountIds: [] };
  const model: Model = {
    ...buildModel(f.issues, r.names, { site: r.site, jql: r.jql, truncated: r.truncated, rules: rules(), now: r.at }),
    group: g?.name ?? null,
    groups: teamGroups().map((x) => x.name),
    groupMembers: g?.members ?? [],
    groupMissing: f.missing,
    groupAccountIds: f.accountIds,
  };
  models.set(key, model);
  return model;
}

/** Consulta puntual (para el agente): JQL libre, máximo 2 páginas, sin tocar la caché. */
export async function adHocModel(jql: string, signal?: AbortSignal): Promise<Model> {
  const { issues, names, truncated, site } = await searchJql(jql, { pages: 2, signal });
  return buildModel(issues, names, { site, jql, truncated, rules: rules() });
}
