import 'server-only';
import type { Rules } from './types';

export class ConfigError extends Error {
  constructor(public varName: string) {
    super(`Falta la variable de entorno ${varName}`);
  }
}

export function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v == null || v.trim() === '') {
    if (fallback !== undefined) return fallback;
    throw new ConfigError(name);
  }
  return v.trim();
}

export const DEFAULT_JQL = 'project in (ALCR) AND updated >= -90d ORDER BY updated DESC';
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

const num = (name: string, d: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function rules(): Rules {
  return {
    prd: env('DEPLOY_REGEX_PRD', '\\b(prd|prod|producci[oó]n|production)\\b'),
    qa: env('DEPLOY_REGEX_QA', '\\b(qa|uat|pruebas|testing|certificaci[oó]n)\\b'),
    dev: env('DEPLOY_REGEX_DEV', '\\bdev\\b'),
    block: env('BLOCK_REGEX', 'bloque|block|imped|en espera|on hold|stopper|detenid'),
    inprog: num('INPROGRESS_DAYS', 5),
    stale: num('STALE_DAYS', 5),
  };
}

export const normName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface TeamGroup { name: string; members: string[] }

/**
 * TEAM_GROUPS define grupos de responsables:
 *   Aplicaciones: Ana Pérez, Luis Gómez; Diseño: María Ruiz
 * Grupos separados por ";" (o salto de línea); nombre y miembros separados por el primer ":";
 * miembros separados por ",". Cada miembro puede ser el nombre visible en Jira, el correo o el accountId.
 */
export function teamGroups(): TeamGroup[] {
  const src = process.env.TEAM_GROUPS || '';
  const out: TeamGroup[] = [];
  for (const seg of src.split(/[;\n]/)) {
    const s = seg.trim();
    if (!s) continue;
    const i = s.indexOf(':');
    const name = (i > 0 ? s.slice(0, i) : 'Mi equipo').trim();
    const members = (i > 0 ? s.slice(i + 1) : s).split(',').map((m) => m.trim()).filter(Boolean);
    if (name && members.length && !out.some((g) => normName(g.name) === normName(name))) out.push({ name, members });
  }
  return out;
}

export const defaultGroupName = () => (process.env.TEAM_DEFAULT_GROUP || '').trim() || null;

export const cacheSeconds = () => num('JIRA_CACHE_SECONDS', 300);
export const maxPages = () => num('JIRA_MAX_PAGES', 20);
