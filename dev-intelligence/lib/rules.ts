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

export const median = (a: number[]): number | null => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
