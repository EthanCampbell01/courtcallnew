import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useAuth } from '../api.jsx';
import { Toast, useToast } from '../components/shared.jsx';
import ScoringInfo, { ScoringButton } from '../components/ScoringInfo.jsx';

const CELLS = [
  ['total_points', 'total points', '⭐'],
  ['win_rate', 'win rate %', '🎯'],
  ['streak', 'current streak', '🔥'],
  ['avg_points', 'avg per match', '📊'],
  ['scored', 'scored picks', '✅'],
  ['pending', 'pending picks', '⏳'],
  ['exact_scores', 'exact scores', '🎱'],
  ['upsets_called', 'upsets called', '💥'],
  ['perfect_calls', 'perfect 48s', '🏆'],
  ['best_match', 'best match', '⚡'],
];

export default function Stats() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [msg, toast] = useToast();
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [showScoring, setShowScoring] = useState(false);

  useEffect(() => {
    api('/stats/me').then(setStats).catch((e) => toast(e.message));
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api(`/users/search?q=${encodeURIComponent(q.trim())}`).then(setResults).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const doLogout = async () => {
    await logout();
    nav('/auth', { replace: true });
  };

  return (
    <div className="page">
      <div className="row between">
        <h1 className="page-title">Stats</h1>
        <ScoringButton onClick={() => setShowScoring(true)} />
      </div>
      <p className="page-sub">
        Signed in as <b style={{ color: 'var(--text)' }}>{user?.username}</b>{user?.is_admin ? ' · admin' : ''}
      </p>

      {showScoring && <ScoringInfo onClose={() => setShowScoring(false)} />}

      {!stats ? <div className="empty">Loading…</div> : (
        <div className="stat-grid">
          {CELLS.map(([k, label, icon]) => (
            <div key={k} className="stat">
              <span className="icon">{icon}</span>
              <div className="value">{stats[k] ?? '–'}</div>
              <div className="label">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="section-label" style={{ marginTop: 20 }}>Head to head</div>
      <div className="card">
        <div className="field" style={{ marginBottom: results.length ? 12 : 0 }}>
          <label htmlFor="hs">Find a rival</label>
          <input id="hs" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username…" />
        </div>
        {results.map((u) => (
          <Link key={u.id} to={`/h2h/${u.id}`} className="feed-item row between" style={{ display: 'flex', textDecoration: 'none' }}>
            <b>{u.username}</b>
            <span className="card-meta">compare →</span>
          </Link>
        ))}
        {q.trim().length >= 2 && results.length === 0 && (
          <div className="card-meta" style={{ marginTop: 8 }}>No users found.</div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
        {user?.is_admin && <button className="btn ghost block" onClick={() => nav('/admin')}>Admin panel</button>}
        <button className="btn ghost block" onClick={() => nav('/circuits')}>Manage circuits</button>
        <button className="btn danger block" onClick={doLogout}>Log out</button>
      </div>
      <Toast message={msg} />
    </div>
  );
}
