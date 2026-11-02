'use client';
import type { EnvName, Issue } from '@/lib/types';

export const KeyLink = ({ i }: { i: Pick<Issue, 'key' | 'url'> }) => (
  <a className="key" href={i.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{i.key}</a>
);

export const KeyBtn = ({ k, onOpen }: { k: string; onOpen: (k: string) => void }) => (
  <button type="button" className="btn ghost sm mono" onClick={(e) => { e.stopPropagation(); onOpen(k); }} title="Ver detalle">{k}</button>
);

export const StatusPill = ({ i }: { i: Pick<Issue, 'cat' | 'status'> }) => <span className={`pill ${i.cat}`}>{i.status}</span>;

export const EnvChip = ({ env }: { env: EnvName | null }) => (env ? <span className={`env ${env}`}>{env}</span> : null);

export const CritPill = ({ c }: { c: 'Alta' | 'Media' | 'Baja' }) => <span className={`pill ${c === 'Alta' ? 'crit' : c === 'Media' ? 'warn' : 'info'}`}>{c}</span>;

export const KindTag = ({ kind }: { kind: string }) =>
  kind === 'Hecho' || kind === 'hecho' ? <span className="tag fact">Hecho</span> : <span className="tag inf">Inferencia</span>;

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{children}</button>;
}
