// Elimination bracket that reads like tournamentsoftware: each match is aligned
// to the matches whose winners feed it, with connector lines drawn between them.
// Byes are scraped as "Bye" slots purely so the tree is complete and connected.

// Round-robin groups are not part of an elimination tree. A junior draw often has
// both (groups, then a knockout), so the bracket shows only the knockout part and
// always in playing order, never in whatever order the rounds happened to arrive.
const LADDER = ['Round of 128', 'Round of 64', 'Round of 32', 'Round of 16', 'Quarter-Final', 'Semi-Final', 'Final'];

export default function BracketView({ rounds, onSelectMatch }) {
  const cols0 = (rounds || [])
    .filter((r) => LADDER.includes(r.name) && r.matches?.length)
    .sort((a, b) => LADDER.indexOf(a.name) - LADDER.indexOf(b.name));
  if (!cols0.length) return <div className="empty">This draw is played as groups — see the list view.</div>;

  const MATCH_H = 58, BYE_H = 28, VGAP = 12, COL_W = 214, MATCH_W = 184, LABEL_H = 26;
  const isReal = (name) => name && name !== 'TBD' && name !== 'Bye';
  // Advancing past a bye is not a tie anyone plays or predicts. Early rounds are
  // mostly byes, so giving them a full card let them swamp the real matches;
  // they get one compact line that still holds the tree together.
  const isBye = (m) => m.player1 === 'Bye' || m.player2 === 'Bye';
  const hOf = (m) => (isBye(m) ? BYE_H : MATCH_H);
  const feeds = (fm, m) =>
    (isReal(m.player1) && (fm.player1 === m.player1 || fm.player2 === m.player1)) ||
    (isReal(m.player2) && (fm.player1 === m.player2 || fm.player2 === m.player2));

  // vertical position of each match — centred on the matches that feed it
  const topOf = {}, midOf = {};
  const cols = cols0.map((round, r) => {
    const prev = r > 0 ? cols0[r - 1].matches : null;
    let bottom = null;
    const ys = round.matches.map((m) => {
      const h = hOf(m);
      let y;
      if (r === 0) {
        y = bottom == null ? 0 : bottom + VGAP;
      } else {
        const mids = prev.filter((fm) => feeds(fm, m)).map((fm) => midOf[fm.id]).filter((v) => v != null);
        y = mids.length
          ? mids.reduce((a, b) => a + b, 0) / mids.length - h / 2
          : (bottom == null ? 0 : bottom + VGAP);
      }
      if (bottom != null && y < bottom + VGAP) y = bottom + VGAP; // keep order, no overlap
      bottom = y + h;
      topOf[m.id] = y;
      midOf[m.id] = y + h / 2;
      return y;
    });
    return { round, ys };
  });

  const height = Math.max(MATCH_H, ...cols.flatMap((c) => c.round.matches.map((m) => topOf[m.id] + hOf(m)))) + LABEL_H + 8;
  const width = (cols.length - 1) * COL_W + MATCH_W;

  const connectors = [];
  cols.forEach((c, r) => {
    if (r === 0) return;
    const prev = cols0[r - 1].matches;
    c.round.matches.forEach((m) => {
      const my = LABEL_H + midOf[m.id], mx = r * COL_W, fx = (r - 1) * COL_W + MATCH_W, midX = (fx + mx) / 2;
      prev.filter((fm) => feeds(fm, m)).forEach((fm) => {
        const fy = LABEL_H + midOf[fm.id];
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
        {cols.map((c, r) => (
          <div key={`l${c.round.id}`} className="section-label"
            style={{ position: 'absolute', left: r * COL_W, top: 0, width: MATCH_W, textAlign: 'center', margin: 0 }}>
            {c.round.name}
          </div>
        ))}
        {cols.map((c, r) => c.round.matches.map((m) => (
          <div key={m.id} style={{ position: 'absolute', left: r * COL_W, top: LABEL_H + topOf[m.id], width: MATCH_W, height: hOf(m) }}>
            {isBye(m)
              ? <ByeSlot name={m.player1 === 'Bye' ? m.player2 : m.player1} seed={m.player1 === 'Bye' ? m.seed2 : m.seed1} />
              : <BracketMatch match={m} onClick={() => onSelectMatch?.(c.round, m)} />}
          </div>
        )))}
      </div>
    </div>
  );
}

// one line: this player had no opponent and simply advances
function ByeSlot({ name, seed }) {
  return (
    <div className="bracket-bye">
      <span className="nm">{name}</span>
      {seed != null && <span className="seed">[{seed}]</span>}
      <span className="bye-tag">bye</span>
    </div>
  );
}

function BracketMatch({ match, onClick }) {
  const done = match.status !== 'scheduled';
  return (
    <button onClick={onClick} className="bracket-match">
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
        fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: isWinner ? 700 : 500,
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
