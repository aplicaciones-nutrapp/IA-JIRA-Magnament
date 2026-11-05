const TZ = 'America/Bogota';
const dfmt = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });
const dtfmt = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const sfmt = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', timeZone: TZ });
const hfmt = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const wdfmt = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: '2-digit', month: 'long', timeZone: TZ });
const dayKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ });

export const fD = (t: number | null | undefined) => (t ? dfmt.format(t) : '—');
export const fDT = (t: number | null | undefined) => (t ? dtfmt.format(t) : '—');
export const fS = (t: number | null | undefined) => (t ? sfmt.format(t) : '—');
export const fH = (t: number) => hfmt.format(t);
export const fWD = (t: number) => wdfmt.format(t);
export const dayOf = (t: number) => dayKey.format(t);
export const daysTxt = (n: number | null | undefined) => (n == null ? '—' : n < 1 ? '<1 d' : `${Math.floor(n)} d`);
/* ───────── periodos relativos a hoy (hora de Bogotá) ───────── */
export type Period = 'hoy' | 'ayer' | '7d' | '30d';
export const PERIODS: [Period, string][] = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7d', 'Últimos 7 días'], ['30d', 'Últimos 30 días']];
const DAYMS = 864e5;
export function inPeriod(t: number | null | undefined, p: Period, now = Date.now()) {
  if (!t) return false;
  if (p === 'hoy') return dayOf(t) === dayOf(now);
  if (p === 'ayer') return dayOf(t) === dayOf(now - DAYMS);
  return now - t <= (p === '7d' ? 7 : 30) * DAYMS;
}
/** «Hoy», «Ayer», «Antes de ayer» o la fecha con día de la semana. */
export function relDayLabel(t: number, now = Date.now()) {
  const d = dayOf(t);
  if (d === dayOf(now)) return 'Hoy';
  if (d === dayOf(now - DAYMS)) return 'Ayer';
  if (d === dayOf(now - 2 * DAYMS)) return 'Antes de ayer';
  const s = fWD(t);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const isoDay =(t: number | null | undefined) => (t ? new Date(t).toISOString().slice(0, 10) : undefined);
