const RULES = [
  { label: 'Correct winner', pts: 10, icon: '🎯', color: 'var(--accent)' },
  { label: 'Correct set count', pts: 5, icon: '📊', color: 'var(--blue)' },
  { label: 'Exact scoreline', pts: 15, icon: '🔢', color: 'var(--purple)' },
  { label: 'Upset bonus', pts: 8, icon: '💥', color: 'var(--warn)' },
  { label: 'Perfect call (all three)', pts: 10, icon: '🏆', color: 'var(--gold)' },
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
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>How scoring works</h2>
          <span className="pill" style={{ color: 'var(--accent)', borderColor: 'var(--accent-glow)', background: 'var(--accent-dim)' }}>
            max 48/match
          </span>
        </div>

        {RULES.map((r) => (
          <div key={r.label} className="score-row score-row--compact">
            <span style={{ fontSize: 17 }}>{r.icon}</span>
            <span className="grow" style={{ fontWeight: 600, fontSize: 13.5 }}>{r.label}</span>
            <span className="pts" style={{ color: r.color }}>+{r.pts}</span>
          </div>
        ))}

        <p className="card-meta" style={{ marginTop: 10 }}>
          Sets, exact score and the upset bonus only count if you also called the winner right.
          Walkovers &amp; retirements pay winner points only.
        </p>

        <button className="btn block" style={{ marginTop: 14 }} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
