import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.jsx';
import MatchCard from '../components/MatchCard.jsx';
import { Toast, useToast } from '../components/shared.jsx';
import ScoringInfo, { ScoringPip } from '../components/ScoringInfo.jsx';
import PixelCourt from '../components/PixelCourt.jsx';

// Keep the API's ordering but bucket rows under their tournament so the list
// reads tournament-by-tournament instead of one long mixed feed.
function groupByTournament(items) {
  const groups = [];
  const seen = new Map();
  for (const it of items) {
    const key = it.tournament_id ?? it.tournament_name;
    if (!seen.has(key)) {
      seen.set(key, groups.length);
      groups.push({ id: it.tournament_id, name: it.tournament_name, items: [] });
    }
    groups[seen.get(key)].items.push(it);
  }
  return groups;
}

function GroupHead({ id, name, count }) {
  const label = <span className="pg-name">{name || 'Tournament'}</span>;
  return (
    <div className="pick-group-head">
      {id ? <Link to={`/tournaments/${id}`} className="pg-link">{label}</Link> : label}
      <span className="pg-count">{count} {count === 1 ? 'match' : 'matches'}</span>
    </div>
  );
}

export default function Predictions() {
  const [tab, setTab] = useState('open');
  const [open, setOpen] = useState(null);
  const [mine, setMine] = useState(null);
  const [toast, showToast] = useToast();
  const [showScoring, setShowScoring] = useState(false);

  const load = () => {
    api('/predictions/open').then(setOpen).catch(() => setOpen([]));
    api('/predictions/mine').then(setMine).catch(() => setMine([]));
  };
  useEffect(load, []);

  return (
    <div className="page">
      <div className="row between">
        <h1 className="page-title">Predictions</h1>
        <ScoringPip onClick={() => setShowScoring(true)} />
      </div>
      <p className="page-sub">Lock in your calls before the deadline</p>
      {showScoring && <ScoringInfo onClose={() => setShowScoring(false)} />}

      <div className="tabs">
        <button className={`tab${tab === 'open' ? ' active' : ''}`} onClick={() => setTab('open')}>
          Open {open ? `(${open.length})` : ''}
        </button>
        <button className={`tab${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>
          My picks {mine ? `(${mine.length})` : ''}
        </button>
      </div>

      {tab === 'open' && (
        open === null ? <div className="empty">Loading…</div> :
        open.length === 0 ? (
          <div>
            <PixelCourt height={128} showScore={false} />
            <div className="empty">Nothing open right now. Browse <Link to="/tournaments" style={{ color: 'var(--accent)' }}>tournaments</Link> for what's coming.</div>
          </div>
        ) : (
          groupByTournament(open).map((g) => (
            <section key={g.id ?? g.name} className="pick-group">
              <GroupHead id={g.id} name={g.name} count={g.items.length} />
              {g.items.map((m) => (
                <MatchCard
                  key={m.id}
                  match={{ ...m, my_prediction: m.my_prediction_id ? { predicted_winner: m.predicted_winner, predicted_sets: m.predicted_sets, predicted_score: m.predicted_score } : null }}
                  deadline={m.deadline}
                  locked={false}
                  context={`${m.event_type} · ${m.round_name}`}
                  onSaved={load}
                  showToast={showToast}
                />
              ))}
            </section>
          ))
        )
      )}

      {tab === 'mine' && (
        mine === null ? <div className="empty">Loading…</div> :
        mine.length === 0 ? <div className="empty"><div className="big">🎯</div>No picks yet — your calls will show up here.</div> :
        groupByTournament(mine).map((g) => (
          <section key={g.id ?? g.name} className="pick-group">
            <GroupHead id={g.id} name={g.name} count={g.items.length} />
            {g.items.map((p) => (
              <div key={p.id} className="card">
                <div className="row between">
                  <div className="grow">
                    <div className="card-meta mono" style={{ fontSize: 11 }}>{p.event_type} · {p.round_name}</div>
                    <div className="card-title" style={{ marginTop: 2 }}>
                      {p.player1} vs {p.player2}
                    </div>
                    <div className="card-meta">
                      Your call: <b style={{ color: 'var(--text)' }}>{p.predicted_winner === 1 ? p.player1 : p.player2}</b>
                      {p.predicted_score ? ` · ${p.predicted_score}` : p.predicted_sets ? ` in ${p.predicted_sets}` : ''}
                    </div>
                    {p.status !== 'scheduled' && (
                      <div className="card-meta">
                        Result: {p.winner === 1 ? p.player1 : p.player2} {p.score || `(${p.status})`}
                      </div>
                    )}
                  </div>
                  {p.points != null
                    ? <span className="points-chip">+{p.points}</span>
                    : <span className="pill">{p.locked ? 'locked' : 'open'}</span>}
                </div>
                {p.breakdown && (
                  <div className="breakdown">
                    {Object.entries(p.breakdown).map(([k, v]) => (
                      <span key={k} className={`pill${v ? ' hit' : ''}`}>{k} {v ? `+${v}` : '✗'}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        ))
      )}
      <Toast message={toast} />
    </div>
  );
}
