import 'server-only';
import { buildModel } from './analyze';
import { DEFAULT_JQL, cacheSeconds, env, maxPages, rules } from './env';
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

/* ───────── caché en memoria de la instancia ───────── */
let cache: { at: number; model: Model } | null = null;
let inflight: Promise<Model> | null = null;

export async function getModel(force = false): Promise<Model> {
  if (!force && cache && Date.now() - cache.at < cacheSeconds() * 1000) return cache.model;
  if (inflight) return inflight;
  inflight = (async () => {
    const jql = env('JIRA_JQL', DEFAULT_JQL);
    const { issues, names, truncated, site } = await searchJql(jql);
    const model = buildModel(issues, names, { site, jql, truncated, rules: rules() });
    cache = { at: Date.now(), model };
    return model;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Consulta puntual (para el agente): JQL libre, máximo 2 páginas, sin tocar la caché. */
export async function adHocModel(jql: string, signal?: AbortSignal): Promise<Model> {
  const { issues, names, truncated, site } = await searchJql(jql, { pages: 2, signal });
  return buildModel(issues, names, { site, jql, truncated, rules: rules() });
}
