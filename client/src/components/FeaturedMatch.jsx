import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.jsx';
import { Countdown } from './shared.jsx';
import { isPadel } from '../sport.js';
import { drawCourt } from './court.js';

// The dashboard's featured court. One match at a time, chosen by the caller:
//   mode 'live' — a match you've picked whose deadline has passed, no result yet
//   mode 'pick' — your soonest un-picked open match; the court IS the pick input
//   mode 'none' — nothing on; a calm, dimmed court
const PAL = isPadel
  ? { court: '#1657a0', line: '#e8f2ff', net: '#0d3a6f', post: '#22d3ee', ball: '#e8ff59', p1: '#3bd6c0', p2: '#22d3ee', dim: '#1b4d86', wall: '#4d8fc9', glass: '#9fe0ff' }
  : { court: '#14351f', line: '#dfe8dc', net: '#0c2413', post: '#f0a838', ball: '#f0a838', p1: '#43a56d', p2: '#f0a838', dim: '#2c5238' };
const HL = isPadel ? 'rgba(34,211,238,0.14)' : 'rgba(240,168,56,0.12)';
const SPEED = { live: 1.4, pick: 1.0, none: 0.55 };
const H = 92, T = 18, BOT = 16; // top strip / bottom label strip

function surname(name) { return (name || '').split(' ').slice(-1)[0]; }

export default function FeaturedMatch({ mode, match, score = 0, onSaved }) {
  const ref = useRef(null);
  const matchId = match ? (match.match_id ?? match.id) : null;
  const [pick, setPick] = useState(match?.predicted_winner ?? null);
  const [sets, setSets] = useState(match?.predicted_sets ?? null);
  const [scoreStr, setScoreStr] = useState(match?.predicted_score ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setPick(match?.predicted_winner ?? null);
    setSets(match?.predicted_sets ?? null);
    setScoreStr(match?.predicted_score ?? '');
    setErr(''); setSaved(false);
  }, [matchId]);

  // draw the court; highlight the called/predicted winner and lean the ball
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const W = cv.width;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const court = { L: 12, R: W - 12, T, B: H - BOT };
    const spd = SPEED[mode] || 1;
    const ball = { x: W / 2, y: (court.T + court.B) / 2, vx: spd, vy: 0.7 };
    const win = mode === 'none' ? null : pick; // side to highlight
    let raf;
    const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); };
    const spr = (x, cy, c, big) => { const s = big ? 1 : 0; px(x - s, cy - 4 - s, 3 + 2 * s, 3 + s, c); px(x - 1 - s, cy - 1, 5 + 2 * s, 4 + s, c); px(x - 2, cy - 1, 2, 2, '#eaf3e6'); };
    const advance = () => {
      const L = court.L, R = court.R, cx = (L + R) / 2 | 0;
      const lo = win === 2 ? cx : L + 3, hiB = win === 1 ? cx : R - 3;
      ball.x += ball.vx; if (ball.x <= lo) { ball.x = lo; ball.vx = Math.abs(ball.vx); } if (ball.x >= hiB) { ball.x = hiB; ball.vx = -Math.abs(ball.vx); }
      ball.y += ball.vy; if (ball.y <= court.T + 3 || ball.y >= court.B - 3) ball.vy *= -1;
    };
    const render = () => {
      const L = court.L, R = court.R, Tt = court.T, B = court.B, cx = (L + R) / 2 | 0, cy = (Tt + B) / 2 | 0;
      px(0, 0, W, H, PAL.court);
      if (win === 1) px(L, Tt, cx - L, B - Tt, HL);
      if (win === 2) px(cx, Tt, R - cx, B - Tt, HL);
      drawCourt(px, PAL, L, R, Tt, B, isPadel);
      spr(L + 7, cy, win === 1 ? PAL.p2 : (win === 2 ? PAL.dim : PAL.p1), win === 1);
      spr(R - 9, cy, win === 2 ? PAL.p2 : (win === 1 ? PAL.dim : PAL.p1), win === 2);
      px(ball.x, ball.y, 3, 3, PAL.ball);
    };
    const loop = () => { advance(); render(); raf = requestAnimationFrame(loop); };
    if (reduce) render(); else loop();
    return () => cancelAnimationFrame(raf);
  }, [mode, pick]);

  const save = async (winner, s, sc) => {
    if (!matchId || !winner) return;
    setSaving(true); setErr(''); setSaved(false);
    try {
      await api(`/matches/${matchId}/prediction`, {
        method: 'PUT',
        body: { predicted_winner: winner, predicted_sets: s ?? null, predicted_score: (sc || '').trim() || null },
      });
      setSaved(true); setTimeout(() => setSaved(false), 1600);
      onSaved?.();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const tapCourt = (e) => {
    if (mode !== 'pick') return;
    const r = ref.current.getBoundingClientRect();
    const w = (e.clientX - r.left) < r.width / 2 ? 1 : 2;
    setPick(w); save(w, sets, scoreStr);
  };

  const live = mode === 'live';
  const none = mode === 'none' || !match;

  return (
    <div className={`feat${none ? ' calm' : ''}`}>
      <div className={`feat-court${mode === 'pick' ? ' tappable' : ''}`} onClick={tapCourt}>
        <canvas ref={ref} width={248} height={H} aria-hidden="true" />
        <span className={`feat-tag${live ? ' live' : ''}`}>{none ? 'No match on' : live ? 'Live now' : 'Your call'}</span>
        {!none && <span className="feat-score"><small>YOUR SCORE</small> {String(score).padStart(4, '0')}</span>}
        {!none && (
          <>
            <span className={`feat-pl l${pick === 1 ? ' win' : pick === 2 ? ' dim' : ''}`}>{surname(match.player1)}</span>
            <span className={`feat-pl r${pick === 2 ? ' win' : pick === 1 ? ' dim' : ''}`}>{surname(match.player2)}</span>
          </>
        )}
        {mode === 'pick' && !pick && <span className="feat-prompt">Tap to call the winner</span>}
      </div>

      {none ? (
        <div className="feat-info calm">Draws land a few days before play — check back soon.</div>
      ) : (
        <div className="feat-info">
          <div className="grow">
            <div className="feat-who">
              {pick && mode === 'pick'
                ? <>Your call: <span style={{ color: 'var(--accent)' }}>{pick === 1 ? match.player1 : match.player2}</span></>
                : <>{match.player1} v {match.player2}</>}
            </div>
            <div className="feat-meta">
              {match.tournament_name} · {match.event_type} {match.round_name}
              {mode === 'pick' && match.deadline ? <> · <Countdown deadline={match.deadline} /></> : null}
              {pick && mode === 'pick' ? ' · tap court to change' : null}
            </div>
          </div>
          <Link className="btn small" to={live ? `/tournaments/${match.tournament_id}` : `/tournaments/${match.tournament_id}`}>
            {live ? 'Follow →' : 'Details →'}
          </Link>
        </div>
      )}

      {mode === 'pick' && pick && (
        <div className="feat-predict">
          <div className="fp-row">
            <span className="fp-lab">Sets</span>
            {[2, 3].map((n) => (
              <button key={n} className={`set-chip${sets === n ? ' picked' : ''}`}
                onClick={() => { const v = sets === n ? null : n; setSets(v); save(pick, v, scoreStr); }}>
                {n}
              </button>
            ))}
            <span className="fp-note">{saving ? 'Saving…' : saved ? 'Saved ✓' : ''}</span>
          </div>
          <div className="fp-row">
            <span className="fp-lab">Score</span>
            <input className="input mono" style={{ letterSpacing: '0.06em', textTransform: 'none', textAlign: 'left', padding: '7px 10px', fontSize: 13 }}
              placeholder="6-4 3-6 6-2" value={scoreStr}
              onChange={(e) => setScoreStr(e.target.value)}
              onBlur={() => save(pick, sets, scoreStr)} />
          </div>
          {err && <div className="feat-err">{err}</div>}
        </div>
      )}
    </div>
  );
}
