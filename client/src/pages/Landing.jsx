import { useNavigate } from 'react-router-dom';
import { BRAND, isPadel } from '../sport.js';

const FEATURES = [
  { icon: isPadel ? '🎾' : '🎾', title: 'Predict every match', desc: `Call the winning ${isPadel ? 'pair' : 'player'}, the set count, even the exact score before each round locks.`, color: 'var(--accent)' },
  { icon: '🏆', title: 'Compete in leagues', desc: 'Create a private league for a tournament, share the invite code, climb the leaderboard.', color: 'var(--blue)' },
  { icon: '🏆', title: 'Call the champion', desc: 'Back who wins the whole draw before play starts — bonus points for an unseeded outsider.', color: 'var(--purple)' },
  { icon: '⚔️', title: 'Head-to-head bragging rights', desc: 'Compare your calls against any rival, match for match.', color: 'var(--warn)' },
];

export default function Landing() {
  const nav = useNavigate();

  return (
    <div className="auth-wrap" style={{ justifyContent: 'flex-start', paddingTop: '10vh' }}>
      <div className="logo" style={{ fontSize: 42 }}>{BRAND.name.slice(0, -4)}<span className="ball">Call</span></div>
      <div className="logo-tag" style={{ marginBottom: 36 }}>call every match. top every league.</div>

      <p style={{ fontSize: 15, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 28 }}>
        {BRAND.tagline}. Join a circuit, call the draw, and see who really knows the game.
      </p>

      <div style={{ display: 'grid', gap: 10, marginBottom: 30 }}>
        {FEATURES.map((f, i) => (
          <div key={f.title} className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', animationDelay: `${i * 0.06}s` }}>
            <span style={{
              fontSize: 20, width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface-2)', border: `1px solid ${f.color}`,
            }}>
              {f.icon}
            </span>
            <span>
              <div className="card-title">{f.title}</div>
              <div className="card-meta">{f.desc}</div>
            </span>
          </div>
        ))}
      </div>

      <button className="btn block" onClick={() => nav('/auth', { state: { mode: 'register' } })}>Get started</button>
      <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => nav('/auth', { state: { mode: 'login' } })}>
        I already have an account
      </button>

      <p className="card-meta" style={{ marginTop: 22, textAlign: 'center' }}>
        Try the demo: username <span className="mono">demo</span>, PIN <span className="mono">0000</span>
      </p>
    </div>
  );
}
