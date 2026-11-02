'use client';
import { useEffect, useRef } from 'react';
import type { Issue } from '@/lib/types';
import { clip } from '@/lib/rules';
import { daysTxt, fD, fDT } from '@/lib/format';
import { EnvChip, KeyLink, StatusPill } from './ui';

export default function IssueDrawer({ i, onClose, onAsk }: { i: Issue; onClose: () => void; onAsk: (q: string) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const blocks = [...i.blockFacts.map((f) => f.why), i.blockInfer?.why].filter(Boolean);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={`Detalle de ${i.key}`}>
        <div className="hd">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <KeyLink i={i} /> <StatusPill i={i} /> <EnvChip env={i.env} />
              {i.blocked && <span className="pill crit">bloqueado</span>}{i.overdue && <span className="pill warn">vencido</span>}
            </div>
            <h2 style={{ fontSize: 19 }}>{i.summary}</h2>
          </div>
          <button ref={closeRef} type="button" className="btn ghost" onClick={onClose}>Cerrar</button>
        </div>
        <dl className="kv">
          <dt>Proyecto</dt><dd>{i.project.key} {i.project.name}</dd>
          <dt>Tipo</dt><dd>{i.type}</dd>
          <dt>Responsable</dt><dd>{i.assignee}</dd>
          <dt>Prioridad</dt><dd>{i.priority}{i.sp != null ? ` · ${i.sp} SP` : ''}</dd>
          <dt>En el estado actual</dt><dd>{daysTxt(i.daysInStatus)} (desde {fDT(i.statusSince)})</dd>
          <dt>Fechas</dt><dd>Creado {fD(i.created)} · vence {fD(i.due)} · resuelto {fD(i.resolved)}</dd>
          {i.sprints.length > 0 && <><dt>Sprint</dt><dd>{i.sprints.map((s) => s.name + (s.state === 'active' ? ' (activo)' : '')).join(', ')}</dd></>}
          {i.links.length > 0 && <><dt>Vínculos</dt><dd>{i.links.map((l, n) => <div key={n}>{l.phrase} <span className="key">{l.key}</span>{l.status ? ` (${l.status})` : ''}</div>)}</dd></>}
          {blocks.length > 0 && <><dt>Bloqueo</dt><dd>{blocks.join(' · ')}</dd></>}
        </dl>
        {i.description && <div><div className="eyebrow">Descripción</div><p className="small" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{clip(i.description, 900)}</p></div>}
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Historial de estados</div>
          <div className="tl">
            <div className="ev"><div className="small muted">{fDT(i.created)}</div><div>Creado por {i.reporter}</div></div>
            {i.transitions.map((t, n) => <div className="ev" key={n}><div className="small muted">{fDT(t.at)}</div><div>{t.from || '—'} → <strong>{t.to}</strong> · {t.by}</div></div>)}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Comentarios ({i.comments.length})</div>
          {i.comments.length ? i.comments.slice(-12).reverse().map((c, n) => (
            <div className="cmt" style={{ paddingInline: 0 }} key={n}><div className="h"><strong>{c.by}</strong><span className="muted">{fDT(c.at)}</span></div><div className="txt">{clip(c.text, 800)}</div></div>
          )) : <p className="small muted">Sin comentarios.</p>}
        </div>
        <div><button type="button" className="btn primary" onClick={() => { onClose(); onAsk(`Analiza el issue ${i.key}: estado, historial, comentarios, posibles bloqueos y qué acción recomiendas.`); }}>Preguntar al agente por {i.key}</button></div>
      </div>
    </div>
  );
}
