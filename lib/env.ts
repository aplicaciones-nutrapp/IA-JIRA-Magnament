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

export const cacheSeconds = () => num('JIRA_CACHE_SECONDS', 300);
export const maxPages = () => num('JIRA_MAX_PAGES', 20);
