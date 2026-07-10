// Elimination bracket that reads like tournamentsoftware: each match is aligned
// to the matches whose winners feed it, with connector lines drawn between them.
// Byes are scraped as "Bye" slots purely so the tree is complete and connected.
export default function BracketView({ rounds, onSelectMatch }) {
  if (!rounds || rounds.length === 0) return null;
  const MATCH_H = 58, VGAP = 18, COL_W = 214, MATCH_W = 184, LABEL_H = 26;
  const SLOT = MATCH_H + VGAP;
  const isReal = (name) => name && name !== 'TBD' && name !== 'Bye';
  const feeds = (fm, m) =>
    (isReal(m.player1) && (fm.player1 === m.player1 || fm.player2 === m.player1)) ||
    (isReal(m.player2) && (fm.player1 === m.player2 || fm.player2 === m.player2));

  // vertical position of each match — the midpoint of the matches that feed it
  const yOf = {};
  const cols = rounds.map((round, r) => {
    const prev = r > 0 ? rounds[r - 1].matches : null;
    let last = null;
    const ys = round.matches.map((m, i) => {
      let y;
      if (r === 0) {
        y = i * SLOT;
      } else {
        const fy = prev.filter((fm) => feeds(fm, m)).map((fm) => yOf[fm.id]).filter((v) => v != null);
        y = fy.length ? fy.reduce((a, b) => a + b, 0) / fy.length : (last == null ? 0 : last + SLOT);
      }
      if (last != null && y < last + SLOT) y = last + SLOT; // keep order, no overlap
      last = y;
      yOf[m.id] = y;
      return y;
    });
    return { round, ys };
  });

  const height = Math.max(MATCH_H, ...cols.flatMap((c) => c.ys.map((y) => y + MATCH_H))) + LABEL_H + 8;
  const width = rounds.length * COL_W;

  const connectors = [];
  cols.forEach((c, r) => {
    if (r === 0) return;
    const prev = rounds[r - 1].matches;
    c.round.matches.forEach((m, i) => {
      const my = LABEL_H + c.ys[i] + MATCH_H / 2, mx = r * COL_W, fx = (r - 1) * COL_W + MATCH_W, midX = (fx + mx) / 2;
      prev.filter((fm) => feeds(fm, m)).forEach((fm) => {
        const fy = LABEL_H + yOf[fm.id] + MATCH_H / 2;
        connectors.push(
          <polyline key={fm.id + '-' + m.id} points={`${fx},${fy} ${midX},${fy} ${midX},${my} ${mx},${my}`}
            fill="none" stroke="var(--border-light)" strokeWidth="1.5" />
        );
      });
    });
  });

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ position: 'relative', width, height, minWidth: width }}>
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{connectors}</svg>
        {rounds.map((round, r) => (
          <div key={`l${round.id}`} className="section-label"
            style={{ position: 'absolute', left: r * COL_W, top: 0, width: MATCH_W, textAlign: 'center', margin: 0 }}>
            {round.name}
          </div>
        ))}
        {cols.map((c, r) => c.round.matches.map((m, i) => (
          <div key={m.id} style={{ position: 'absolute', left: r * COL_W, top: LABEL_H + c.ys[i], width: MATCH_W, height: MATCH_H }}>
            <BracketMatch match={m} onClick={() => onSelectMatch?.(c.round, m)} />
          </div>
        )))}
      </div>
    </div>
  );
}

function BracketMatch({ match, onClick }) {
  const isBye = match.player1 === 'Bye' || match.player2 === 'Bye';
  const done = match.status !== 'scheduled';
  return (
    <button
      onClick={isBye ? undefined : onClick}
      disabled={isBye}
      style={{
        width: '100%', height: '100%', textAlign: 'left', cursor: isBye ? 'default' : 'pointer',
        background: 'var(--surface-2)', border: '1.5px solid var(--border)', borderRadius: 10,
        overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: isBye ? 0.8 : 1,
      }}
    >
      <BracketPlayer name={match.player1} seed={match.seed1} isWinner={done && match.winner === 1} isPick={match.my_prediction?.predicted_winner === 1} />
      <div style={{ height: 1, background: 'var(--border)' }} />
      <BracketPlayer name={match.player2} seed={match.seed2} isWinner={done && match.winner === 2} isPick={match.my_prediction?.predicted_winner === 2} />
    </button>
  );
}

function BracketPlayer({ name, seed, isWinner, isPick }) {
  const bye = name === 'Bye';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
      padding: '6px 9px', flex: 1,
      background: isWinner ? 'var(--accent-dim)' : 'transparent',
    }}>
      <span style={{
        fontSize: 12.5, fontWeight: isWinner ? 700 : 500,
        color: bye ? 'var(--text-faint)' : isWinner ? 'var(--accent)' : 'var(--text)',
        fontStyle: bye ? 'italic' : 'normal',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {isPick && !isWinner && <span style={{ color: 'var(--accent)' }}>★ </span>}
        {name}
      </span>
      {seed != null && !bye && <span className="seed" style={{ flexShrink: 0 }}>[{seed}]</span>}
    </div>
  );
}
