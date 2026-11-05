// Reglas de texto compartidas por servidor y navegador (sin dependencias de entorno).

export const DAY = 864e5;

/** Frases en comentarios que sugieren un bloqueo (inferencia, no hecho). */
export const BLOCK_TXT =
  /(bloquead|bloqueo|impedimento|stopper|\bblocked\b|esperando|en espera|pendiente de (respuesta|acceso|aprobaci|credencial|informaci|confirmaci)|dependemos|sin acceso|no (hemos podido|he podido|se puede|puedo|podemos) (continuar|avanzar|seguir|desplegar|probar))/i;

export const UNBLOCK_TXT = /resuelto|desbloque|ya (tenemos|qued[oó])|solucionad/i;

/** Etiquetas de comentarios por palabras clave (inferencia). */
export const TAGS: [string, RegExp][] = [
  ['riesgo', /riesgo|\brisk\b|retras|atras|urgente|cr[ií]tic|podr[ií]a (fallar|afectar)/i],
  ['dependencia', /depende|dependencia|esperando|tercero|proveedor|infraestructura|sin acceso|acceso a/i],
  ['decisión', /decid|acordamos|se defini|vamos a usar|optamos|se aprob/i],
  ['compromiso', /me comprometo|queda para|para el (lunes|martes|mi[eé]rcoles|jueves|viernes)|para ma[ñn]ana|lo tengo listo|fecha de entrega|entrego/i],
  ['solicitud', /\?|por favor|favor de|necesito|necesitamos|solicit|pueden|podr[ií]an|podr[ií]as/i],
  ['problema', /\berror\b|falla|fallo|\bbug\b|no funciona|excepci[oó]n|\b500\b|timeout|ca[ií]d[oa]|se devuelve/i],
  ['intervención', /escal|prioriz|aprobaci[oó]n|l[ií]der|decisi[oó]n de negocio/i],
];
export const TAG_NAMES = TAGS.map(([t]) => t);
export const tagsOf = (t: string) => TAGS.filter(([, re]) => re.test(t)).map(([n]) => n);

export function prioRank(p?: string | null): number {
  const s = (p || '').toLowerCase();
  if (/highest|blocker|cr[ií]tic|urgente|muy alta/.test(s)) return 5;
  if (/high|alta/.test(s)) return 4;
  if (/medium|media|normal/.test(s)) return 3;
  if (/lowest|muy baja|trivial/.test(s)) return 1;
  if (/low|baja|minor/.test(s)) return 2;
  return 3;
}

/* ───────── tono de color de un estado ───────── */
export type Tone = 'new' | 'progress' | 'approval' | 'dev' | 'qa' | 'review' | 'prd' | 'blocked' | 'done' | 'canceled';
export const TONE_LABEL: [Tone, string][] = [
  ['new', 'Por hacer'], ['progress', 'En curso'], ['approval', 'Aprobación'], ['dev', 'Despliegue DEV'], ['qa', 'Despliegue QA'],
  ['review', 'Revisión / pruebas'], ['prd', 'Despliegue PROD'], ['blocked', 'Detenido'], ['done', 'Completado'], ['canceled', 'Cancelado'],
];
const CANCEL_RE = /cancel|descart|anulad|rechazad|won'?t do|duplicad/i;
const DONE_RE = /completad|finaliz|cerrad|terminad|resuelt|^listo$|^done$/i;
const NEW_RE = /por hacer|backlog|to do|pendiente$|abierto|nuevo/i;
const APPROVAL_RE = /aprobaci[oó]n|stakeholder|por aprobar/i;
const REVIEW_RE = /revisi[oó]n|pruebas|regresi[oó]n|aprobado por qa|testing|\buat\b|validaci[oó]n/i;
const reCache = new Map<string, RegExp>();
const rx = (src: string) => {
  if (!reCache.has(src)) { let r: RegExp; try { r = new RegExp(src, 'i'); } catch { r = /$^/; } reCache.set(src, r); }
  return reCache.get(src)!;
};
/** Color de un estado. `cat` es la categoría de Jira cuando se conoce (el estado actual); en el historial se deduce del nombre. */
export function toneOf(status: string, cat: string | undefined, r: { dev: string; qa: string; prd: string; block: string }): Tone {
  const s = status || '';
  if (cat === 'done' || (!cat && (DONE_RE.test(s) || CANCEL_RE.test(s)))) return CANCEL_RE.test(s) ? 'canceled' : 'done';
  if (rx(r.block).test(s)) return 'blocked';
  if (rx(r.prd).test(s)) return 'prd';
  if (rx(r.qa).test(s)) return 'qa';
  if (rx(r.dev).test(s)) return 'dev';
  if (APPROVAL_RE.test(s)) return 'approval';
  if (REVIEW_RE.test(s)) return 'review';
  if (cat === 'new' || (!cat && NEW_RE.test(s))) return 'new';
  return 'progress';
}
/** Tono estable a partir de un texto (proyectos, personas). */
export const hueOf = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/** Completado de verdad: estado final que no es cancelación y con fecha de completado. */
export const isDone = (i: { cat: string; canceled?: boolean; resolved: number | null }) => i.cat === 'done' && !i.canceled && !!i.resolved;

export const median =(a: number[]): number | null => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
