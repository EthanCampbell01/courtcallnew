// Read-only elimination bracket: rounds in columns, each column a fixed height
// with its matches distributed evenly (so it funnels many → few). Robust to the
// uneven round sizes real draws have (byes, walkovers, odd counts) rather than
// assuming a perfect power-of-two bracket.
export default function BracketView({ rounds, onSelectMatch }) {
  if (!rounds || rounds.length === 0) return null;
  const MATCH_H = 76, GAP = 10;
  const maxMatches = Math.max(1, ...rounds.map((r) => r.matches.length));
  const colHeight = maxMatches * MATCH_H + (maxMatches - 1) * GAP;

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8, minWidth: rounds.length * 198 }}>
        {rounds.map((round) => (
          <div key={round.id} style={{ minWidth: 190, flexShrink: 0 }}>
            <div className="section-label" style={{ textAlign: 'center', margin: '0 0 10px' }}>{round.name}</div>
            <div style={{ height: colHeight, display: 'flex', flexDirection: 'column', justifyContent: round.matches.length > 1 ? 'space-around' : 'center', gap: GAP }}>
              {round.matches.map((m) => (
                <div key={m.id} style={{ height: MATCH_H, padding: '0 6px', flexShrink: 0 }}>
                  <BracketMatch match={m} onClick={() => onSelectMatch?.(round, m)} />
                </div>
              ))}
              {round.matches.length === 0 && (
                <div style={{ height: MATCH_H, margin: '0 6px', border: '1px dashed var(--border)', borderRadius: 8 }} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketMatch({ match, onClick }) {
  const done = match.status !== 'scheduled';
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', height: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'var(--surface-2)', border: '1.5px solid var(--border)', borderRadius: 10,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}
    >
      <BracketPlayer name={match.player1} seed={match.seed1} isWinner={done && match.winner === 1} isPick={match.my_prediction?.predicted_winner === 1} />
      <div style={{ height: 1, background: 'var(--border)' }} />
      <BracketPlayer name={match.player2} seed={match.seed2} isWinner={done && match.winner === 2} isPick={match.my_prediction?.predicted_winner === 2} />
    </button>
  );
}

function BracketPlayer({ name, seed, isWinner, isPick }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
      padding: '6px 9px', flex: 1,
      background: isWinner ? 'var(--accent-dim)' : 'transparent',
    }}>
      <span style={{
        fontSize: 12.5, fontWeight: isWinner ? 700 : 500,
        color: isWinner ? 'var(--accent)' : 'var(--text)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {isPick && !isWinner && <span style={{ color: 'var(--accent)' }}>★ </span>}
        {name}
      </span>
      {seed != null && <span className="seed" style={{ flexShrink: 0 }}>[{seed}]</span>}
    </div>
  );
}
