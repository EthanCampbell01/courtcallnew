import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, useAuth } from '../api.jsx';
import { Toast, useToast, timeAgo } from '../components/shared.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_CLASS = ['gold', 'silver', 'bronze'];

function feedText(f) {
  let p = {};
  try { p = JSON.parse(f.payload || '{}'); } catch { /* noop */ }
  switch (f.type) {
    case 'league_created': return <><b>{p.username || f.username || 'Someone'}</b> created the league{p.name ? <> <b>{p.name}</b></> : null}</>;
    case 'member_joined': return <><b>{p.username || f.username || 'Someone'}</b> joined the league</>;
    case 'member_left': return <><b>{p.username || f.username || 'Someone'}</b> left the league</>;
    case 'result': return p.player1
      ? <>Result: <b>{p.winner}</b> beat {p.winner === p.player1 ? p.player2 : p.player1} <span className="mono">{p.score}</span></>
      : <>A match result was entered</>;
    default: return f.type;
  }
}

export default function LeagueDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [msg, toast] = useToast();
  const [league, setLeague] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api(`/leagues/${id}`).then(setLeague).catch((e) => toast(e.message));
  }, [id]);

  if (!league) return <div className="page"><div className="empty">Loading…</div></div>;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(league.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { toast(`Code: ${league.invite_code}`); }
  };

  const leave = async () => {
    if (!window.confirm('Leave this league?')) return;
    try {
      await api(`/leagues/${id}/leave`, { method: 'POST' });
      nav('/leagues');
    } catch (e) { toast(e.message); }
  };

  const pot = league.buy_in > 0 ? league.buy_in * league.member_count : 0;

  return (
    <div className="page">
      <button className="btn small ghost" onClick={() => nav('/leagues')} style={{ marginBottom: 12 }}>← Leagues</button>
      <h1 className="page-title">{league.name}</h1>
      <p className="page-sub">
        {league.tournament_name || league.circuit_name || 'All circuits'} · {league.member_count} member{league.member_count !== 1 ? 's' : ''}
        {pot > 0 ? ` · £${pot} pot` : ''}
      </p>

      <button className="invite-code block" onClick={copyCode}
        style={{ width: '100%', cursor: 'pointer', marginBottom: 16 }}
        aria-label="Copy invite code">
        {league.invite_code}
        <div style={{ fontSize: 11, letterSpacing: 0, fontFamily: 'var(--font-body)', color: 'var(--text-dim)', marginTop: 4 }}>
          {copied ? 'copied!' : 'tap to copy · share with friends'}
        </div>
      </button>

      <div className="section-label">Leaderboard</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {league.leaderboard.map((row, i) => (
          <div key={row.user_id} className={`lb-row${MEDAL_CLASS[i] ? ` ${MEDAL_CLASS[i]}` : ''}${row.user_id === user?.id ? ' me' : ''}`}>
            <span className={`lb-rank${MEDALS[i] ? ' medal' : ''}`}>{MEDALS[i] || i + 1}</span>
            <span className="grow">
              {row.username}{row.user_id === user?.id ? ' (you)' : ''}
              <div className="card-meta">{row.scored_predictions} scored{row.perfect_calls > 0 ? ` · ${row.perfect_calls}× perfect 48` : ''}</div>
            </span>
            <span className="lb-points">{row.total_points}</span>
          </div>
        ))}
      </div>

      <div className="section-label" style={{ marginTop: 18 }}>Activity</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {league.feed.length === 0 && <div className="empty" style={{ padding: 18 }}>Quiet so far — get predicting.</div>}
        {league.feed.map((f) => (
          <div key={f.id} className="feed-item row between">
            <span className="grow">{feedText(f)}</span>
            <span className="feed-time">{timeAgo(f.created_at)}</span>
          </div>
        ))}
      </div>

      <button className="btn danger block" style={{ marginTop: 20 }} onClick={leave}>Leave league</button>
      <Toast message={msg} />
    </div>
  );
}
