const RULES = [
  { label: 'Correct winner', pts: 10, icon: '🎯', color: 'var(--accent)', desc: 'Pick the player who wins the match' },
  { label: 'Correct set count', pts: 5, icon: '📊', color: 'var(--blue)', desc: 'Predict a 2 or 3 setter correctly (needs the right winner)' },
  { label: 'Exact scoreline', pts: 15, icon: '🔢', color: 'var(--purple)', desc: 'Nail the exact score, e.g. 6-4 3-6 7-5 (needs the right winner)' },
  { label: 'Upset bonus', pts: 8, icon: '💥', color: 'var(--warn)', desc: 'The winner you picked was unseeded or a higher seed number' },
  { label: 'Perfect call', pts: 10, icon: '🏆', color: 'var(--gold)', desc: 'Winner + sets + exact score all correct in one match' },
];

export function ScoringButton({ onClick, className = 'btn ghost small' }) {
  return <button className={className} onClick={onClick}>ℹ️ How scoring works</button>;
}

export function ScoringPip({ onClick }) {
  return (
    <button className="scoring-pip" onClick={onClick} aria-label="How scoring works">ℹ️</button>
  );
}

export default function ScoringInfo({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h2 style={{ fontSize: 18, fontWeight: 800, textAlign: 'center', marginBottom: 2 }}>How scoring works</h2>
        <p className="page-sub" style={{ textAlign: 'center', marginBottom: 18 }}>
          Points land the moment an admin enters a result
        </p>

        {RULES.map((r) => (
          <div key={r.label} className="score-row">
            <span className="icon-badge">{r.icon}</span>
            <span className="grow">
              <div style={{ fontWeight: 700, fontSize: 14 }}>{r.label}</div>
              <div className="card-meta" style={{ fontSize: 12 }}>{r.desc}</div>
            </span>
            <span className="pts" style={{ color: r.color }}>+{r.pts}</span>
          </div>
        ))}

        <div style={{
          marginTop: 10, padding: '16px 20px', borderRadius: 14, textAlign: 'center',
          background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
        }}>
          <div className="section-label" style={{ margin: '0 0 4px' }}>Maximum per match</div>
          <span style={{ fontSize: 34, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>48</span>
          <span style={{ fontSize: 14, color: 'var(--text-dim)', marginLeft: 4 }}>pts</span>
        </div>

        <p className="card-meta" style={{ marginTop: 14, textAlign: 'center' }}>
          Walkovers and retirements only award the winner points (+10) — sets, exact score and
          upset bonus don't apply.
        </p>

        <button className="btn block" style={{ marginTop: 16 }} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
