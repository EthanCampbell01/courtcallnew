import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.jsx';
import { Toast, useToast } from '../components/shared.jsx';

export default function Leagues() {
  const nav = useNavigate();
  const [msg, toast] = useToast();
  const [leagues, setLeagues] = useState(null);
  const [tournaments, setTournaments] = useState(null);
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [name, setName] = useState('');
  const [tournamentId, setTournamentId] = useState('');
  const [buyIn, setBuyIn] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/leagues').then(setLeagues).catch((e) => toast(e.message));
    api('/tournaments').then((ts) => {
      setTournaments(ts);
      setTournamentId((prev) => prev || String(ts[0]?.id ?? ''));
    }).catch(() => setTournaments([]));
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const l = await api('/leagues', { method: 'POST', body: { name: name.trim(), tournament_id: Number(tournamentId), buy_in: buyIn ? Number(buyIn) : 0 } });
      nav(`/leagues/${l.id}`);
    } catch (e) { toast(e.message); }
    setBusy(false);
  };

  const join = async () => {
    setBusy(true);
    try {
      const d = await api('/leagues/join', { method: 'POST', body: { invite_code: code.trim() } });
      nav(`/leagues/${d.league.id}`);
    } catch (e) { toast(e.message); }
    setBusy(false);
  };

  return (
    <div className="page">
      <h1 className="page-title">Leagues</h1>
      <p className="page-sub">Compete with friends on the same tournament</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <button className={`btn small ${mode === 'create' ? '' : 'ghost'}`} onClick={() => setMode(mode === 'create' ? null : 'create')}>+ Create</button>
        <button className={`btn small ${mode === 'join' ? '' : 'ghost'}`} onClick={() => setMode(mode === 'join' ? null : 'join')}>Join with code</button>
      </div>

      {mode === 'create' && (
        <div className="card">
          <div className="field">
            <label htmlFor="ln">League name</label>
            <input id="ln" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday Night Tennis" />
          </div>
          <div className="field">
            <label htmlFor="lc">Tournament</label>
            <select id="lc" className="input" value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
              {(tournaments ?? []).length === 0 && <option value="">No tournaments available</option>}
              {(tournaments ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.circuit_name})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lb">Buy-in £ (optional)</label>
            <input id="lb" className="input" type="number" min="0" inputMode="numeric" value={buyIn} onChange={(e) => setBuyIn(e.target.value)} placeholder="0" />
          </div>
          <button className="btn block" disabled={busy || name.trim().length < 2 || !tournamentId} onClick={create}>Create league</button>
        </div>
      )}

      {mode === 'join' && (
        <div className="card">
          <div className="field">
            <label htmlFor="jc">Invite code</label>
            <input id="jc" className="input mono" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TENNIS"
              onKeyDown={(e) => e.key === 'Enter' && code.trim().length === 6 && join()} />
          </div>
          <button className="btn block" disabled={busy || code.trim().length !== 6} onClick={join}>Join league</button>
        </div>
      )}

      {leagues === null ? (
        <div className="empty">Loading…</div>
      ) : leagues.length === 0 ? (
        <div className="empty">
          <div className="big">🏆</div>
          No leagues yet. Create one, or join the demo league with code{' '}
          <span className="mono" style={{ color: 'var(--accent)' }}>TENNIS</span>.
        </div>
      ) : (
        leagues.map((l) => (
          <Link key={l.id} to={`/leagues/${l.id}`} className="card link" style={{ display: 'block' }}>
            <div className="row between">
              <div className="grow">
                <div className="card-title">{l.name}</div>
                <div className="card-meta">
                  {l.tournament_name || l.circuit_name || 'All circuits'} · {l.member_count} member{l.member_count !== 1 ? 's' : ''}
                  {l.buy_in > 0 ? ` · £${l.buy_in} buy-in` : ''}
                </div>
              </div>
              <span className="pill mono">{l.invite_code}</span>
            </div>
          </Link>
        ))
      )}
      <Toast message={msg} />
    </div>
  );
}
