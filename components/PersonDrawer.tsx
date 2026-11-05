'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Issue, Model } from '@/lib/types';
import { isDone } from '@/lib/rules';
import { PERIODS, type Period, daysTxt, fS, inPeriod } from '@/lib/format';
import { Avatar, Chip, KeyLink, SearchField, SelectField, StatusPill, matches, useSort } from './ui';

type Tab = 'abiertos' | 'completados' | 'actividad';

export default function PersonDrawer({ name, m, period, setPeriod, onClose, onOpenIssue, escActive }: {
  name: string; m: Model; period: Period; setPeriod: (p: Period) => void;
  onClose: () => void; onOpenIssue: (k: string) => void; escActive: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<Tab>('abiertos');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    if (!escActive) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, escActive]);

  const mine = useMemo(() => m.issues.filter((i) => i.assignee === name), [m, name]);
  const p = m.team.find((x) => x.name === name);
  const now = Date.now();
  const open = mine.filter((i) => i.open);
  const done = mine.filter((i) => isDone(i) && inPeriod(i.resolved, period, now));
  const active = mine.filter((i) => inPeriod(i.lastActivity, period, now));
  const base: Issue[] = tab === 'abiertos' ? open : tab === 'completados' ? done : active;
  const statuses = useMemo(() => [...new Set(base.map((i) => i.status))].sort(), [base]);
  const rows = base.filter((i) => (!status || i.status === status) && matches(q, i.key, i.summary, i.project.key));
  const ts = useSort(rows, {
    key: (i) => i.key, sum: (i) => i.summary, proj: (i) => i.project.key, status: (i) => i.status, days: (i) => i.daysInStatus,
    prio: (i) => i.prio, due: (i) => i.due, done: (i) => (isDone(i) ? i.resolved : null), act: (i) => i.lastActivity,
  }, { key: 'act', dir: 'desc' });

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer wide" role="dialog" aria-modal="true" aria-label={`Detalle de ${name}`}>
        <div className="hd">
          <div className="pd-head">
            <Avatar name={name} src={m.avatars[name]} size={56} />
            <div>
              <h2 style={{ fontSize: 20 }}>{name}</h2>
              <div className="small muted">{m.group ? `Grupo ${m.group} · ` : ''}última actividad {fS(p?.last)}{p?.medRes != null ? ` · resolución mediana ${p.medRes} d` : ''}</div>
            </div>
          </div>
          <button ref={closeRef} type="button" className="btn ghost" onClick={onClose}>Cerrar</button>
        </div>

        <div className="chips">{PERIODS.map(([k, l]) => <Chip key={k} on={period === k} onClick={() => setPeriod(k)}>{l}</Chip>)}</div>
        <div className="pd-stats">
          <div><b>{open.length}</b><span>Abiertos</span></div>
          <div><b>{open.filter((i) => i.cat === 'indeterminate').length}</b><span>En curso</span></div>
          <div><b style={{ color: 'var(--ok)' }}>{done.length}</b><span>Completados · {PERIODS.find(([k]) => k === period)?.[1]}</span></div>
          <div><b style={{ color: open.some((i) => i.blocked) ? 'var(--crit)' : undefined }}>{open.filter((i) => i.blocked).length}</b><span>Bloqueados</span></div>
          <div><b style={{ color: open.some((i) => i.overdue) ? 'var(--warn)' : undefined }}>{open.filter((i) => i.overdue).length}</b><span>Vencidos</span></div>
        </div>

        <div className="chips">
          <Chip on={tab === 'abiertos'} onClick={() => { setTab('abiertos'); setStatus(''); }}>Abiertos ({open.length})</Chip>
          <Chip on={tab === 'completados'} onClick={() => { setTab('completados'); setStatus(''); }}>Completados ({done.length})</Chip>
          <Chip on={tab === 'actividad'} onClick={() => { setTab('actividad'); setStatus(''); }}>Con actividad en el periodo ({active.length})</Chip>
        </div>
        <div className="filters">
          <SearchField id="pd-q" value={q} onChange={setQ} placeholder="Clave, resumen o proyecto" />
          <SelectField id="pd-status" label="Estado" value={status} onChange={setStatus} options={statuses} />
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr>{ts.th('key', 'Clave')}{ts.th('sum', 'Resumen')}{ts.th('proj', 'Proyecto')}{ts.th('status', 'Estado')}{ts.th('days', 'En estado', { num: true, cls: 'r' })}{ts.th('prio', 'Prioridad', { num: true })}{ts.th('due', 'Vence', { cls: 'r' })}{ts.th('done', 'Completado', { num: true, cls: 'r' })}{ts.th('act', 'Actividad', { num: true, cls: 'r' })}</tr></thead>
          <tbody>{ts.sorted.length ? ts.sorted.map((i) => (
            <tr className="click" key={i.key} onClick={() => onOpenIssue(i.key)}>
              <td><KeyLink i={i} /></td>
              <td className="sum"><div className="clamp">{i.summary}</div></td>
              <td className="small">{i.project.key}</td>
              <td><StatusPill i={i} />{i.blocked && <> <span className="pill crit">bloqueado</span></>}</td>
              <td className="r">{i.open ? daysTxt(i.daysInStatus) : '—'}</td>
              <td className="small">{i.priority}</td>
              <td className="r small">{i.due ? <span style={i.overdue ? { color: 'var(--crit)', fontWeight: 600 } : undefined}>{fS(i.due)}</span> : '—'}</td>
              <td className="r small">{isDone(i) ? fS(i.resolved) : '—'}</td>
              <td className="r small">{fS(i.lastActivity)}</td>
            </tr>
          )) : <tr><td colSpan={9} className="empty">{tab === 'completados' ? 'No completó issues en este periodo.' : 'No hay issues con estos filtros.'}</td></tr>}</tbody>
        </table></div>
      </div>
    </div>
  );
}
