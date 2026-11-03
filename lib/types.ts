// Modelo que el servidor calcula a partir de Jira y envía al navegador.
// Todas las fechas van como milisegundos desde epoch (number) para viajar en JSON.

export type Cat = 'new' | 'indeterminate' | 'done';
export type EnvName = 'DEV' | 'QA' | 'PRD';

export interface Transition { at: number; by: string; from: string; to: string }
export interface IssueComment { at: number; by: string; text: string; mentions: string[] }
export interface SprintRef { id: string | number; name: string; state: string; start: number | null; end: number | null }
export interface IssueLink { type: string; phrase: string; dir: 'in' | 'out'; key: string; summary: string; status: string; cat: string }
export interface BlockFact { why: string; since: number | null; who: string | null }

export interface Issue {
  key: string;
  url: string;
  summary: string;
  project: { key: string; name: string };
  type: string;
  status: string;
  cat: Cat;
  priority: string;
  prio: number;
  assignee: string;
  reporter: string;
  created: number | null;
  updated: number | null;
  resolved: number | null;
  due: number | null;
  labels: string[];
  sp: number | null;
  sprints: SprintRef[];
  flagged: boolean;
  flaggedAt: number | null;
  links: IssueLink[];
  comments: IssueComment[];
  transitions: Transition[];
  versions: string[];
  parent: string | null;
  description: string;
  // derivados
  statusSince: number | null;
  daysInStatus: number | null;
  backMoves: number;
  open: boolean;
  overdue: boolean;
  env: EnvName | null;
  lastActivity: number;
  activeSprint: string | null;
  blockFacts: BlockFact[];
  blockInfer: { why: string; since: number; comment: IssueComment } | null;
  blocked: boolean;
  stale: boolean;
  quiet: boolean;
}

export interface Stopper {
  key: string;
  kind: 'hecho' | 'inferencia';
  reasons: string[];
  since: number | null;
  elapsed: number | null;
  resolver: string;
  crit: 'Alta' | 'Media' | 'Baja';
  last: IssueComment | null;
}

export interface Deploy { at: number; env: EnvName; key: string; by: string; from: string; to: string; after: string[] }

export interface Person {
  name: string; open: number; inprog: number; spOpen: number; overdue: number; blocked: number; stale: number;
  done30: number; spDone30: number; medRes: number | null; last: number | null; keys: string[];
}

export interface ProjectStat {
  key: string; name: string; total: number; open: number; inprog: number; overdue: number; blocked: number;
  stale: number; done30: number; oldest: number; delay: number;
}

export interface SprintStat {
  id: string | number; name: string; start: number | null; end: number | null; total: number; done: number;
  spT: number; spD: number; elapsed: number | null; prog: number; blocked: number; daysLeft: number | null;
  gap: number | null; keys: string[];
}

export interface Week { start: number; created: number; resolved: number; prd: number }

export interface Alert { sev: 'crit' | 'warn' | 'info'; kind: 'Hecho' | 'Inferencia'; title: string; detail: string; keys: string[] }

export interface Kpi {
  total: number; open: number; inprog: number; blocked: number; blockedInf: number; overdue: number;
  done30: number; medRes30: number | null; prd7: number; stale: number;
}

export interface Rules { inprog: number; stale: number; dev: string; qa: string; prd: string; block: string }

export interface Model {
  ref: number;
  site: string;
  jql: string;
  truncated: boolean;
  fields: { sp?: string; sprint?: string; flagged?: string };
  hasSP: boolean;
  rules: Rules;
  kpi: Kpi;
  alerts: Alert[];
  stoppers: Stopper[];
  deploys: Deploy[];
  team: Person[];
  projects: ProjectStat[];
  sprints: SprintStat[];
  weeks: Week[];
  issues: Issue[];
  /** Grupo de responsables aplicado (null = todos) y grupos configurados en TEAM_GROUPS. */
  group: string | null;
  groups: string[];
  groupMembers: string[];
  /** Miembros del grupo que no son responsables de ningún issue sincronizado. */
  groupMissing: string[];
  groupAccountIds: string[];
}

export interface SyncError { error: string; detail?: string; code?: string }
