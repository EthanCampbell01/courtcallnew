// Read-only elimination bracket: rounds laid out in columns, matches spaced
// so winners visually line up with their next-round slot (classic bracket look).
export default function BracketView({ rounds, onSelectMatch }) {
  if (!rounds || rounds.length === 0) return null;
  const MATCH_H = 76;

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', minWidth: rounds.length * 200 }}>
        {rounds.map((round, ri) => {
          const gap = 2 ** ri * MATCH_H;
          const topOffset = (gap - MATCH_H) / 2;
          return (
            <div key={round.id} style={{ minWidth: 190, flexShrink: 0 }}>
              <div className="section-label" style={{ textAlign: 'center', margin: '0 0 10px' }}>{round.name}</div>
              {round.matches.map((m, mi) => (
                <div key={m.id} style={{ marginTop: mi === 0 ? topOffset : gap - MATCH_H, height: MATCH_H, padding: '0 6px' }}>
                  <BracketMatch match={m} onClick={() => onSelectMatch?.(round, m)} />
                </div>
              ))}
              {round.matches.length === 0 && (
                <div style={{ height: MATCH_H, margin: '0 6px', border: '1px dashed var(--border)', borderRadius: 8 }} />
              )}
            </div>
          );
        })}
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
