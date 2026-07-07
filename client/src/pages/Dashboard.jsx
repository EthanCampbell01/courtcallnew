import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useAuth } from '../api.jsx';
import { fmtDate } from '../components/shared.jsx';
import ScoringInfo, { ScoringPip } from '../components/ScoringInfo.jsx';
import FeaturedMatch from '../components/FeaturedMatch.jsx';
import NotificationBell from '../components/NotificationBell.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [open, setOpen] = useState(null);
  const [mine, setMine] = useState(null);
  const [leagues, setLeagues] = useState(null);
  const [tournaments, setTournaments] = useState(null);
  const [showScoring, setShowScoring] = useState(false);

  useEffect(() => {
    api('/stats/me').then(setStats).catch(() => {});
    api('/predictions/open').then(setOpen).catch(() => setOpen([]));
    api('/predictions/mine').then(setMine).catch(() => setMine([]));
    api('/tournaments').then(setTournaments).catch(() => setTournaments([]));
    api('/leagues').then((ls) => {
      Promise.all(
        ls.map((l) =>
          api(`/leagues/${l.id}`)
            .then((d) => {
              const idx = d.leaderboard.findIndex((r) => r.user_id === user.id);
              return { ...l, rank: idx + 1 || null, points: idx >= 0 ? d.leaderboard[idx].total_points : 0 };
            })
            .catch(() => ({ ...l, rank: null, points: 0 }))
        )
      ).then(setLeagues);
    }).catch(() => setLeagues([]));
  }, [user.id]);

  const needsPick = (open ?? []).filter((m) => !m.my_prediction_id);
  const ready = open !== null && mine !== null;

  // featured match: a picked match that's locked but not yet decided (in play) →
  // else your soonest un-picked open match → else nothing on.
  const liveMatch = (mine ?? []).find((p) => p.locked && p.status === 'scheduled');
  let mode = 'none', fmatch = null;
  if (ready) {
    if (liveMatch) { mode = 'live'; fmatch = liveMatch; }
    else if (needsPick[0]) { mode = 'pick'; fmatch = needsPick[0]; }
  }
  const league = fmatch ? (leagues ?? []).find((l) => l.tournament_id === fmatch.tournament_id) : null;
  const featScore = league?.points ?? stats?.total_points ?? 0;
  const extra = mode === 'pick' ? needsPick.length - 1 : needsPick.length;

  return (
    <div className="page">
      <div className="row between">
        <h1 className="page-title">Dashboard</h1>
        <span className="row" style={{ gap: 8 }}>
          <NotificationBell />
          <ScoringPip onClick={() => setShowScoring(true)} />
        </span>
      </div>
      <p className="page-sub">Hey {user?.username} — here's where things stand</p>
      {showScoring && <ScoringInfo onClose={() => setShowScoring(false)} />}

      {ready
        ? <FeaturedMatch mode={mode} match={fmatch} score={featScore} />
        : <div className="feat"><div className="feat-court" style={{ height: 78 }} /></div>}

      {extra > 0 && (
        <Link to="/predictions" className="card link row between">
          <span className="grow"><div className="card-title">{extra} more open pick{extra === 1 ? '' : 's'}</div></span>
          <span className="pill mono">→</span>
        </Link>
      )}

      {stats && (
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <div className="stat">
            <span className="icon">⭐</span>
            <div className="value">{stats.total_points}</div>
            <div className="label">total points</div>
          </div>
          <div className="stat">
            <span className="icon">🎯</span>
            <div className="value">{stats.win_rate}%</div>
            <div className="label">win rate</div>
          </div>
        </div>
      )}

      <div className="section-label">Your leagues</div>
      {leagues === null ? (
        <div className="empty">Loading…</div>
      ) : leagues.length === 0 ? (
        <div className="empty">
          No leagues yet. <Link to="/leagues" style={{ color: 'var(--accent)' }}>Create or join one</Link>.
        </div>
      ) : (
        leagues.map((l) => (
          <Link key={l.id} to={`/leagues/${l.id}`} className="card link row between">
            <span className="grow">
              <div className="card-title">{l.name}</div>
              <div className="card-meta">{l.tournament_name || l.circuit_name || 'All circuits'}</div>
            </span>
            <span style={{ textAlign: 'right' }}>
              <div className="lb-points">{l.rank ? `#${l.rank}` : '–'}</div>
              <div className="card-meta">{l.points} pts</div>
            </span>
          </Link>
        ))
      )}

      <div className="section-label">Tournaments</div>
      {tournaments === null ? (
        <div className="empty">Loading…</div>
      ) : tournaments.length === 0 ? (
        <div className="empty">Nothing yet — check back once draws are published.</div>
      ) : (
        tournaments.slice(0, 3).map((t) => (
          <Link key={t.id} to={`/tournaments/${t.id}`} className={`card link row between status-${t.status}`}>
            <span className="grow">
              <div className="card-title">{t.name}</div>
              <div className="card-meta">{t.venue} · {fmtDate(t.start_date)}</div>
            </span>
            <span className={`pill ${t.status === 'live' ? 'live' : t.status === 'completed' ? 'done' : ''}`}>{t.status}</span>
          </Link>
        ))
      )}
      {tournaments?.length > 3 && (
        <Link to="/tournaments" className="card-meta" style={{ display: 'block', textAlign: 'center', marginTop: 6 }}>
          See all {tournaments.length} tournaments →
        </Link>
      )}
    </div>
  );
}
