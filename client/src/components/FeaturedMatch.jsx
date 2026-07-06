import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Countdown } from './shared.jsx';

// The dashboard's featured court. One match at a time, chosen by the caller:
//   mode 'live' — a match you've picked whose deadline has passed, no result yet
//   mode 'pick' — your soonest un-picked open match
//   mode 'none' — nothing on; a calm, dimmed court
const PAL = { court: '#14351f', line: '#dfe8dc', net: '#0c2413', post: '#f0a838', ball: '#f0a838', p1: '#43a56d', p2: '#f0a838' };
const SPEED = { live: 1.5, pick: 1.0, none: 0.55 };

export default function FeaturedMatch({ mode, match, score = 0 }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const W = cv.width, H = cv.height;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const court = { L: 10, R: W - 10, T: 18, B: H - 5 };
    const spd = SPEED[mode] || 1;
    const ball = { x: W / 2 + 16, y: H / 2 + 2, vx: spd, vy: 0.7 };
    let raf;
    const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); };
    const spr = (x, cy, c) => { px(x, cy - 4, 3, 3, c); px(x - 1, cy - 1, 5, 4, c); px(x - 2, cy - 1, 2, 2, '#eaf3e6'); };
    const draw = () => {
      px(0, 0, W, H, PAL.court);
      const L = court.L, R = court.R, T = court.T, B = court.B, cx = (L + R) / 2 | 0, cy = (T + B) / 2 | 0;
      px(L, T, R - L, 1, PAL.line); px(L, B, R - L, 1, PAL.line); px(L, T, 1, B - T, PAL.line); px(R, T, 1, B - T, PAL.line);
      px(L, T + 5, R - L, 1, PAL.line); px(L, B - 5, R - L, 1, PAL.line);
      const sL = L + ((cx - L) * 0.5 | 0), sR = R - ((R - cx) * 0.5 | 0);
      px(sL, T + 5, 1, (B - 5) - (T + 5), PAL.line); px(sR, T + 5, 1, (B - 5) - (T + 5), PAL.line); px(sL, cy, sR - sL, 1, PAL.line);
      for (let ny = T; ny < B; ny += 2) px(cx, ny, 3, 1, PAL.net);
      px(cx - 3, T - 2, 7, 3, PAL.post); px(cx - 3, B - 1, 7, 3, PAL.post);
      spr(L + 6, cy, PAL.p1); spr(R - 8, cy, PAL.p2); px(ball.x, ball.y, 3, 3, PAL.ball);
    };
    const step = () => {
      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.x <= court.L + 2 || ball.x >= court.R - 4) ball.vx = (ball.vx > 0 ? -1 : 1) * spd;
      if (ball.y <= court.T + 2 || ball.y >= court.B - 4) ball.vy *= -1;
      draw(); raf = requestAnimationFrame(step);
    };
    if (reduce) draw(); else step();
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const live = mode === 'live';
  const none = mode === 'none' || !match;

  return (
    <div className={`feat${none ? ' calm' : ''}`}>
      <div className="feat-court">
        <canvas ref={ref} width={248} height={78} aria-hidden="true" />
        <span className={`feat-tag${live ? ' live' : ''}`}>{none ? 'No match on' : live ? 'Live now' : 'Picks open'}</span>
        {!none && (
          <span className="feat-score"><small>YOUR SCORE</small> {String(score).padStart(4, '0')}</span>
        )}
      </div>
      {none ? (
        <div className="feat-info calm">Draws land a few days before play — check back soon.</div>
      ) : (
        <div className="feat-info">
          <div className="grow">
            <div className="feat-who">{match.player1} v {match.player2}</div>
            <div className="feat-meta">
              {match.tournament_name} · {match.event_type} {match.round_name}
              {!live && match.deadline ? <> · <Countdown deadline={match.deadline} /></> : null}
            </div>
          </div>
          <Link className="btn small" to={live ? `/tournaments/${match.tournament_id}` : '/predictions'}>
            {live ? 'Follow →' : 'Predict →'}
          </Link>
        </div>
      )}
    </div>
  );
}
