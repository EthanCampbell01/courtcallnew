import { useState } from 'react';
import { api } from '../api.jsx';
import { Countdown, ReactionBar } from './shared.jsx';

const player = (m, n) => (
  <>
    {n === 1 ? m.player1 : m.player2}
    {(n === 1 ? m.seed1 : m.seed2) != null && <span className="seed"> [{n === 1 ? m.seed1 : m.seed2}]</span>}
  </>
);

export default function MatchCard({ match, deadline, locked, context, onSaved, showToast }) {
  const initial = match.my_prediction || {
    predicted_winner: match.predicted_winner ?? null,
    predicted_sets: match.predicted_sets ?? null,
    predicted_score: match.predicted_score ?? '',
  };
  const [pick, setPick] = useState(initial.predicted_winner);
  const [sets, setSets] = useState(initial.predicted_sets);
  const [score, setScore] = useState(initial.predicted_score || '');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [others, setOthers] = useState(null);
  const [error, setError] = useState('');

  const done = match.status !== 'scheduled';
  const editable = !locked && !done;

  const save = async (winner = pick, s = sets, sc = score) => {
    if (!winner) return;
    setSaving(true);
    setError('');
    try {
      await api(`/matches/${match.id}/prediction`, {
        method: 'PUT',
        body: { predicted_winner: winner, predicted_sets: s ?? null, predicted_score: sc?.trim() || null },
      });
      showToast?.('Pick saved');
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const choose = (winner) => {
    if (!editable) return;
    setPick(winner);
    save(winner, sets, score);
  };

  const loadOthers = async () => {
    if (others) return setExpanded(!expanded);
    try {
      const d = await api(`/matches/${match.id}/predictions`);
      setOthers(d);
      setExpanded(true);
    } catch (e) {
      setError(e.message);
    }
  };

  const statusPill = done ? (
    <span className="pill done">{match.status === 'completed' ? 'final' : match.status}</span>
  ) : locked ? (
    <span className="pill locked">locked</span>
  ) : (
    <Countdown deadline={deadline} />
  );

  return (
    <div className="card match">
      <div className="match-head row between">
        <span>{context}</span>
        {statusPill}
      </div>
      <div className="match-body">
        {[1, 2].map((n) => {
          const isPick = pick === n;
          const cls = done
            ? `player-btn ${match.winner === n ? 'winner' : 'loser'}`
            : `player-btn${isPick ? ' picked' : ''}`;
          return (
            <button key={n} className={cls} disabled={!editable} onClick={() => choose(n)}>
              <span>
                {player(match, n)}
                {done && match.winner === n && ' 🏆'}
              </span>
              {done && match.winner === n && match.score && <span className="score-line">{match.score}</span>}
              {!done && isPick && <span className="seed">your pick</span>}
            </button>
          );
        })}

        {editable && pick && (
          <div className="detail-grid">
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Sets</label>
            <div className="sets-row">
              {[2, 3].map((n) => (
                <button
                  key={n}
                  className={`set-chip${sets === n ? ' picked' : ''}`}
                  onClick={() => { const v = sets === n ? null : n; setSets(v); save(pick, v, score); }}
                >
                  {n}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Exact score</label>
            <input
              className="input mono"
              style={{ letterSpacing: '0.08em', textTransform: 'none', textAlign: 'left', padding: '8px 11px', fontSize: 13 }}
              placeholder="6-4 3-6 6-2"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              onBlur={() => save(pick, sets, score)}
            />
          </div>
        )}

        {match.my_prediction?.points != null && (
          <div className="breakdown">
            <span className="points-chip">+{match.my_prediction.points} pts</span>
            {Object.entries(JSON.parse(match.my_prediction.breakdown || '{}')).map(([k, v]) => (
              <span key={k} className={`pill${v ? ' hit' : ''}`}>{k} {v ? `+${v}` : '✗'}</span>
            ))}
          </div>
        )}

        {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}

        <button className="btn ghost small" style={{ marginTop: 10 }} onClick={loadOthers}>
          {expanded ? 'Hide picks' : `Picks (${match.prediction_count ?? '…'})`}
        </button>

        {expanded && others && (
          <div style={{ marginTop: 10 }}>
            {!others.revealed && others.hidden_count > 0 && (
              <p className="card-meta">🔒 {others.hidden_count} pick{others.hidden_count > 1 ? 's' : ''} hidden until the match completes</p>
            )}
            {others.predictions.map((p) => (
              <div key={p.id} className="card" style={{ background: 'var(--surface-2)', marginTop: 8 }}>
                <div className="row between">
                  <span className="card-title" style={{ fontSize: 14 }}>
                    {p.mine ? 'You' : p.username}
                    <span className="card-meta" style={{ display: 'inline', marginLeft: 8 }}>
                      → {p.predicted_winner === 1 ? match.player1 : match.player2}
                      {p.predicted_score ? ` (${p.predicted_score})` : p.predicted_sets ? ` in ${p.predicted_sets}` : ''}
                    </span>
                  </span>
                  {p.points != null && <span className="points-chip">+{p.points}</span>}
                </div>
                <ReactionBar prediction={p} onChange={async () => {
                  const d = await api(`/matches/${match.id}/predictions`);
                  setOthers(d);
                }} />
              </div>
            ))}
            {others.predictions.length === 0 && <p className="card-meta">No picks yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
