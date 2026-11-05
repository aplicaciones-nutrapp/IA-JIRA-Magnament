'use client';
import { createContext, useContext, useMemo, useState } from 'react';
import type { EnvName, Issue, Rules } from '@/lib/types';
import { hueOf, toneOf } from '@/lib/rules';

/** Reglas del servidor (expresiones de ambientes y bloqueo) para colorear estados. */
export const RulesCtx = createContext<Rules | null>(null);
const FALLBACK = { dev: '\\bdev\\b', qa: '\\bqa\\b', prd: '\\b(prd|prod)\\b', block: 'bloque|detenid|imped' };
const projOf = (key: string) => key.split('-')[0];

/** Clave del issue como etiqueta, con un color por proyecto. Abre el issue en Jira. */
export const KeyLink = ({ i }: { i: Pick<Issue, 'key' | 'url'> }) => (
  <a className="ktag" style={{ '--h': hueOf(projOf(i.key)) } as React.CSSProperties} href={i.url} target="_blank" rel="noopener noreferrer" title="Abrir en Jira" onClick={(e) => e.stopPropagation()}>{i.key}</a>
);

export const KeyBtn = ({ k, onOpen }: { k: string; onOpen: (k: string) => void }) => (
  <button type="button" className="ktag" style={{ '--h': hueOf(projOf(k)) } as React.CSSProperties} onClick={(e) => { e.stopPropagation(); onOpen(k); }} title="Ver detalle">{k}</button>
);

/** Estado con color según su etapa (por hacer, en curso, aprobación, DEV, QA, revisión, PROD, detenido, completado). */
export function StatusTag({ name, cat }: { name: string; cat?: string }) {
  const r = useContext(RulesCtx) || FALLBACK;
  return <span className={`pill st st-${toneOf(name, cat, r)}`}>{name || '—'}</span>;
}
export const StatusPill = ({ i }: { i: Pick<Issue, 'cat' | 'status'> }) => <StatusTag name={i.status} cat={i.cat} />;

export const EnvChip = ({ env }: { env: EnvName | null }) => (env ? <span className={`env ${env}`}>{env}</span> : null);

export const CritPill = ({ c }: { c: 'Alta' | 'Media' | 'Baja' }) => <span className={`pill ${c === 'Alta' ? 'crit' : c === 'Media' ? 'warn' : 'info'}`}>{c}</span>;

export const KindTag = ({ kind }: { kind: string }) =>
  kind === 'Hecho' || kind === 'hecho' ? <span className="tag fact">Hecho</span> : <span className="tag inf">Inferencia</span>;

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{children}</button>;
}

/* ───────── personas ───────── */
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function Avatar({ name, src, size = 20 }: { name: string; src?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, '--h': hueOf(name), fontSize: Math.max(9, Math.round(size * 0.4)) } as React.CSSProperties;
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="av" src={src} alt="" width={size} height={size} style={style} referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} />;
  }
  return <span className="av ini" style={style} aria-hidden="true">{initials(name) || '?'}</span>;
}

/** Nombre de persona como etiqueta con foto. */
export function PersonTag({ name, avatars }: { name: string; avatars?: Record<string, string> }) {
  if (!name || name === 'Sin asignar' || name === '—') return <span className="ptag none">{name || '—'}</span>;
  return (
    <span className="ptag" style={{ '--h': hueOf(name) } as React.CSSProperties} title={name}>
      <Avatar name={name} src={avatars?.[name]} size={18} />
      <span className="ptag-n">{name}</span>
    </span>
  );
}

/* ───────── tablas ordenables ───────── */
type Val = string | number | null | undefined;
export function useSort<T>(rows: T[], getters: Record<string, (r: T) => Val>, init: { key: string; dir: 'asc' | 'desc' }) {
  const [s, setS] = useState(init);
  const sorted = useMemo(() => {
    const g = getters[s.key];
    if (!g) return rows;
    const m = s.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = g(a), y = g(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, s]);
  const th = (key: string, label: React.ReactNode, o: { num?: boolean; cls?: string } = {}) => {
    const on = s.key === key;
    return (
      <th className={o.cls} aria-sort={on ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="th-sort" onClick={() => setS(on ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: o.num ? 'desc' : 'asc' })}>
          {label}<span className="arr" aria-hidden="true">{on ? (s.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>
    );
  };
  return { sorted, th };
}

/** Coincidencia de texto sin mayúsculas ni tildes. */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const matches = (q: string, ...parts: (string | null | undefined)[]) => !q || norm(parts.filter(Boolean).join(' ')).includes(norm(q));

export function SearchField({ id, value, onChange, placeholder, label = 'Buscar' }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <div className="field grow">
      <label htmlFor={id}>{label}</label>
      <input type="search" id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SelectField({ id, label, value, onChange, options, all = 'Todos' }: { id: string; label: string; value: string; onChange: (v: string) => void; options: (string | [string, string])[]; all?: string | null }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {all !== null && <option value="">{all}</option>}
        {options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
      </select>
    </div>
  );
}
