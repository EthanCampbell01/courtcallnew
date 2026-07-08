import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.jsx';
import { useSport } from '../sport.jsx';
import { Toast, useToast } from '../components/shared.jsx';

const ROWS = [
  ['total_points', 'Total points'],
  ['win_rate', 'Win rate %'],
  ['streak', 'Streak'],
  ['exact_scores', 'Exact scores'],
  ['upsets_called', 'Upsets'],
  ['perfect_calls', 'Perfect 48s'],
  ['best_match', 'Best match'],
];

export default function H2H() {
  const { userId } = useParams();
  const { sport } = useSport();
  const nav = useNavigate();
  const [msg, toast] = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    api(`/h2h/${userId}?sport=${sport}`).then(setData).catch((e) => toast(e.message));
  }, [userId, sport]);

  if (!data) return <div className="page"><div className="empty">Loading…</div></div>;

  const { me, them, record, common_matches } = data;

  return (
    <div className="page">
      <button className="btn small ghost" onClick={() => nav(-1)} style={{ marginBottom: 12 }}>← Back</button>
      <h1 className="page-title">{me.username} <span style={{ color: 'var(--text-faint)' }}>vs</span> {them.username}</h1>
      <p className="page-sub">On matches you've both predicted</p>

      <div className="card" style={{ textAlign: 'center' }}>
        <div className="row" style={{ justifyContent: 'center', gap: 26 }}>
          <div>
            <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: 'var(--accent)' }}>{record.wins}</div>
            <div className="card-meta">you</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-faint)' }}>{record.draws}</div>
            <div className="card-meta">draws</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 30, fontWeight: 700 }}>{record.losses}</div>
            <div className="card-meta">{them.username}</div>
          </div>
        </div>
      </div>

      <div className="section-label" style={{ marginTop: 16 }}>Stat for stat</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {ROWS.map(([k, label]) => {
          const a = me[k] ?? 0;
          const b = them[k] ?? 0;
          return (
            <div key={k} className="h2h-grid">
              <span className={`mono${a > b ? ' win' : ''}`}>{me[k] ?? '–'}</span>
              <span className="vs">{label}</span>
              <span className={`mono${b > a ? ' win' : ''}`}>{them[k] ?? '–'}</span>
            </div>
          );
        })}
      </div>

      <div className="section-label" style={{ marginTop: 16 }}>Common matches</div>
      {common_matches.length === 0 ? (
        <div className="empty">No completed matches you've both called yet.</div>
      ) : (
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {common_matches.map((c) => (
            <div key={c.match_id} className="feed-item row between">
              <span className="grow">
                <b>{c.player1}</b> vs <b>{c.player2}</b>
                <div className="card-meta">{c.tournament_name} · <span className="mono">{c.score || 'completed'}</span></div>
              </span>
              <span className="mono" style={{ whiteSpace: 'nowrap' }}>
                <span style={{ color: c.my_points > c.their_points ? 'var(--accent)' : 'inherit' }}>{c.my_points}</span>
                <span style={{ color: 'var(--text-faint)' }}> – </span>
                <span style={{ color: c.their_points > c.my_points ? 'var(--accent)' : 'inherit' }}>{c.their_points}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <Toast message={msg} />
    </div>
  );
}
