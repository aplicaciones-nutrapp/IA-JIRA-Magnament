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
export const isoDay = (t: number | null | undefined) => (t ? new Date(t).toISOString().slice(0, 10) : undefined);
