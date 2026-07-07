import { useEffect, useRef } from 'react';
import { isPadel } from '../sport.js';
import { drawCourt } from './court.js';

// Night-palette pixel court, rendered on a low-res canvas and upscaled with
// nearest-neighbour so it reads as pixel art. Tennis = green court / amber;
// padel = a blue glass-walled court / cyan + volt ball.
const PAL = isPadel
  ? { court: '#1657a0', line: '#e8f2ff', net: '#0d3a6f', post: '#22d3ee',
      ball: '#e8ff59', p1: '#3bd6c0', p2: '#22d3ee', acc: '#22d3ee', text: '#eaf2ff', wall: '#123f6e', glass: '#6fc7f5' }
  : { court: '#14351f', line: '#dfe8dc', net: '#0c2413', post: '#f0a838',
      ball: '#f0a838', p1: '#43a56d', p2: '#f0a838', acc: '#f0a838', text: '#edefea' };

export default function PixelCourt({ score = 0, hi = 0, height = 72, showScore = true }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const W = cv.width, H = cv.height;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const court = { L: 14, R: W - 14, T: showScore ? 20 : 8, B: H - 5 };
    const ball = { x: W / 2 + 22, y: H / 2 + 2, vx: 1.25, vy: 0.7 };
    let raf;

    const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); };
    const sprite = (x, cy, c) => { px(x, cy - 4, 3, 3, c); px(x - 1, cy - 1, 5, 4, c); px(x - 2, cy - 1, 2, 2, '#eaf3e6'); };
    const text = (str, x, y, c) => { ctx.fillStyle = c; ctx.font = 'bold 11px "Cascadia Code","Consolas",monospace'; ctx.textBaseline = 'top'; ctx.fillText(str, x, y); };

    const draw = () => {
      px(0, 0, W, H, PAL.court);
      if (showScore) {
        text('SCORE ' + String(score).padStart(4, '0'), 6, 4, PAL.acc);
        const hiStr = 'HI ' + String(hi).padStart(4, '0');
        text(hiStr, W - hiStr.length * 7 - 6, 4, PAL.text);
      }
      const L = court.L, R = court.R, T = court.T, B = court.B, cy = (T + B) / 2 | 0;
      drawCourt(px, PAL, L, R, T, B, isPadel);
      sprite(L + 7, cy, PAL.p1);
      sprite(R - 9, cy, PAL.p2);
      px(ball.x, ball.y, 3, 3, PAL.ball);
    };

    const step = () => {
      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.x <= court.L + 2 || ball.x >= court.R - 4) ball.vx *= -1;
      if (ball.y <= court.T + 2 || ball.y >= court.B - 4) ball.vy *= -1;
      draw();
      raf = requestAnimationFrame(step);
    };

    if (reduce) draw(); else step();
    return () => cancelAnimationFrame(raf);
  }, [score, hi, showScore]);

  return (
    <div className="pixelcourt">
      <canvas ref={ref} width={248} height={height} aria-hidden="true" />
    </div>
  );
}
