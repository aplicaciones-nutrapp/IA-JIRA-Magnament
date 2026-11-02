'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (res.ok) { window.location.href = '/'; return; }
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'No se pudo ingresar.');
    } catch {
      setError('No hay conexión con el servidor.');
    }
    setBusy(false);
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none"><path d="M2 12.5 6 8l3 2.5L14 4" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <h1 style={{ fontSize: 18 }}>Development Intelligence</h1>
            <div className="small muted">Aplicaciones Digitales</div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy || !password} style={{ justifyContent: 'center', padding: '9px 12px' }}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
