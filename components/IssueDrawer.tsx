'use client';
import { useEffect, useMemo, useRef } from 'react';
import type { Issue } from '@/lib/types';
import { clip } from '@/lib/rules';
import { daysTxt, fD, fDT } from '@/lib/format';
import { KeyLink, PersonTag, StatusPill, StatusTag } from './ui';

type Ev =
  | { at: number; kind: 'created'; by: string }
  | { at: number; kind: 'status'; by: string; from: string; to: string }
  | { at: number; kind: 'comment'; by: string; text: string };

export default function IssueDrawer({ i, avatars, onClose, onAsk }: { i: Issue; avatars: Record<string, string>; onClose: () => void; onAsk: (q: string) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Historial combinado: creación, cambios de estado y comentarios, del más reciente al más antiguo
  const events = useMemo<Ev[]>(() => {
    const ev: Ev[] = [];
    if (i.created) ev.push({ at: i.created, kind: 'created', by: i.reporter });
    for (const t of i.transitions) ev.push({ at: t.at, kind: 'status', by: t.by, from: t.from, to: t.to });
    for (const c of i.comments) ev.push({ at: c.at, kind: 'comment', by: c.by, text: c.text });
    return ev.sort((a, b) => b.at - a.at);
  }, [i]);

  const blocks = [...i.blockFacts.map((f) => f.why), i.blockInfer?.why].filter(Boolean);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={`Detalle de ${i.key}`}>
        <div className="hd">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <KeyLink i={i} /> <StatusPill i={i} />
              {i.blocked && <span className="pill crit">bloqueado</span>}{i.overdue && <span className="pill warn">vencido</span>}{i.canceled && <span className="pill">cancelado</span>}
            </div>
            <h2 style={{ fontSize: 19 }}>{i.summary}</h2>
          </div>
          <button ref={closeRef} type="button" className="btn ghost" onClick={onClose}>Cerrar</button>
        </div>
        <dl className="kv">
          <dt>Proyecto</dt><dd>{i.project.key} {i.project.name}</dd>
          <dt>Tipo</dt><dd>{i.type}</dd>
          <dt>Responsable</dt><dd><PersonTag name={i.assignee} avatars={avatars} /></dd>
          <dt>Reportó</dt><dd><PersonTag name={i.reporter} avatars={avatars} /></dd>
          <dt>Prioridad</dt><dd>{i.priority}{i.sp != null ? ` · ${i.sp} SP` : ''}</dd>
          <dt>En el estado actual</dt><dd>{daysTxt(i.daysInStatus)} (desde {fDT(i.statusSince)})</dd>
          <dt>Fechas</dt><dd>Creado {fD(i.created)} · vence {fD(i.due)} · {i.canceled ? 'cancelado' : 'completado'} {fD(i.resolved)}</dd>
          {i.sprints.length > 0 && <><dt>Sprint</dt><dd>{i.sprints.map((s) => s.name + (s.state === 'active' ? ' (activo)' : '')).join(', ')}</dd></>}
          {i.links.length > 0 && <><dt>Vínculos</dt><dd>{i.links.map((l, n) => <div key={n}>{l.phrase} <span className="key">{l.key}</span>{l.status ? ` (${l.status})` : ''}</div>)}</dd></>}
          {blocks.length > 0 && <><dt>Bloqueo</dt><dd>{blocks.join(' · ')}</dd></>}
        </dl>
        {i.description && <div><div className="eyebrow">Descripción</div><p className="small" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{clip(i.description, 900)}</p></div>}
        <div>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <div className="eyebrow">Historial de la incidencia</div>
            <span className="small muted">{i.transitions.length} cambios de estado · {i.comments.length} comentarios</span>
          </div>
          <div className="tl">
            {events.map((e, n) => (
              <div className={`ev ${e.kind === 'comment' ? 'c' : ''}`} key={n}>
                <div className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{fDT(e.at)} <PersonTag name={e.by} avatars={avatars} /></div>
                {e.kind === 'created' && <div>Creó la incidencia</div>}
                {e.kind === 'status' && <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 3 }}><StatusTag name={e.from || '—'} /> → <StatusTag name={e.to} /></div>}
                {e.kind === 'comment' && <div className="txt">{clip(e.text, 800)}</div>}
              </div>
            ))}
          </div>
        </div>
        <div><button type="button" className="btn primary" onClick={() => { onClose(); onAsk(`Analiza el issue ${i.key}: estado, historial, comentarios, posibles bloqueos y qué acción recomiendas.`); }}>Preguntar al agente por {i.key}</button></div>
      </div>
    </div>
  );
}
