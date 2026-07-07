// Faux-3D padel "glass cage" court, drawn on a canvas. Used by FeaturedMatch and
// PixelCourt on the padel build (tennis keeps the top-down pixel court in court.js).
// A true-to-life court: glass panels to 3m with mesh above, glass wrapping the
// corners with mesh across the middle of the side walls, correct service markings,
// net, and two doubles pairs (one-up-one-back) that track the ball and swing.

const C = {
  line:'#eaf6ff', volt:'#e8ff59', post:'#22d3ee', shadow:'rgba(4,10,24,.45)',
  glass:'rgba(120,205,250,0.10)', glassLit:'rgba(34,211,238,0.17)', sheen:'rgba(160,228,255,0.13)',
  edge:'#8fdcff', mesh:'rgba(140,195,235,0.30)', hlA:'rgba(34,211,238,0.20)', hlB:'rgba(232,255,89,0.15)',
};
const WALL = 0.66, GH = 0.48, NETH = 0.19, SRV = 0.68, SIDEG = 0.60, Z0 = 0.05, Z1 = 0.95;

export function createPadelScene() {
  return {
    t: 0,
    ball: { x: 0, z: 0.5, vx: 1, vz: 0.5, y: 0 },
    players: [
      { side:1, role:'net',  x:-0.34, z:0.42 }, { side:1, role:'back', x:-0.82, z:0.58 },
      { side:2, role:'net',  x: 0.34, z:0.58 }, { side:2, role:'back', x: 0.82, z:0.42 },
    ],
  };
}

// win: 0 none, 1 left, 2 right. speed scales the rally. play=false freezes motion.
export function stepPadelScene(scene, { win = 0, speed = 1, play = true } = {}) {
  if (!play) return;
  scene.t += 0.016;
  const b = scene.ball, s = 0.012 * speed;
  const lo = win === 2 ? 0 : -0.9, hi = win === 1 ? 0 : 0.9;
  b.x += b.vx * s; if (b.x <= lo) { b.x = lo; b.vx = Math.abs(b.vx); } if (b.x >= hi) { b.x = hi; b.vx = -Math.abs(b.vx); }
  b.z += b.vz * (0.010 * speed); if (b.z <= 0.12 || b.z >= 0.88) b.vz *= -1;
  b.y = 0.09 * Math.abs(Math.sin(scene.t * 3));
  for (const p of scene.players) {
    const onSide = (p.side === 1 && b.x < 0) || (p.side === 2 && b.x > 0);
    const tz = onSide ? b.z : (p.role === 'net' ? 0.5 : p.z + (0.5 - p.z) * 0.02);
    p.z += (tz - p.z) * (p.role === 'net' ? 0.09 : 0.05);
    p.swing = Math.max(0, (p.swing || 0) - 0.07);
    p._cool = (p._cool || 0) > 0 ? p._cool - 1 : 0;
    if (onSide && Math.abs(b.x - p.x) < 0.32 && Math.abs(b.z - p.z) < 0.26 && !p._cool) { p.swing = 1; p._cool = 12; }
  }
}

export function drawPadelScene(ctx, W, H, scene, { win = 0 } = {}) {
  const P = (x, y, z) => {
    const cx = W / 2, floorY = H * 0.82, depth = H * 0.34, ux = W * 0.40, uy = H * 0.42;
    const s = 1 - 0.30 * z;
    return [cx + x * ux * s, floorY - z * depth - y * uy * (1 - 0.14 * z)];
  };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const qpath = (A, B, Cc, D) => { ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(Cc[0], Cc[1]); ctx.lineTo(D[0], D[1]); ctx.closePath(); };
  const fillQ = (A, B, Cc, D, st) => { qpath(A, B, Cc, D); ctx.fillStyle = st; ctx.fill(); };
  const seg = (a, b, st, lw) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.strokeStyle = st; ctx.lineWidth = lw || 1; ctx.stroke(); };
  const vlines = (A, B, Cc, D, n, st, lw) => { for (let i = 0; i <= n; i++) { const u = i / n; seg(lerp(A, B, u), lerp(D, Cc, u), st, lw || 1); } };
  const hlines = (A, B, Cc, D, n, st, lw) => { for (let i = 0; i <= n; i++) { const v = i / n; seg(lerp(A, D, v), lerp(B, Cc, v), st, lw || 1); } };
  const meshQ = (A, B, Cc, D, nV, nH) => { ctx.save(); qpath(A, B, Cc, D); ctx.clip(); vlines(A, B, Cc, D, nV, C.mesh, 1); hlines(A, B, Cc, D, nH, C.mesh, 1); ctx.restore(); };
  const glassQ = (A, B, Cc, D, lit) => {
    fillQ(A, B, Cc, D, lit ? C.glassLit : C.glass);
    fillQ(A, lerp(A, B, .5), lerp(D, Cc, .5), D, C.sheen);
    vlines(A, B, Cc, D, 4, lit ? C.post : C.edge, lit ? 1.4 : 1);
    seg(A, B, 'rgba(143,220,255,.4)', 1); seg(D, Cc, lit ? C.post : C.edge, lit ? 2.2 : 1.6);
  };
  const endWall = (side, lit) => {
    const b0 = P(side,0,Z0), b1 = P(side,0,Z1), g0 = P(side,GH,Z0), g1 = P(side,GH,Z1), m0 = P(side,WALL,Z0), m1 = P(side,WALL,Z1);
    glassQ(b0, b1, g1, g0, lit); meshQ(g0, g1, m1, m0, 6, 2);
    seg(g0, g1, lit ? C.post : C.edge, 1.4);
    seg(P(side,0,Z0), P(side,WALL,Z0), C.post, 2.4); seg(P(side,0,Z1), P(side,WALL,Z1), C.post, 2.4);
    if (lit) { ctx.save(); ctx.globalAlpha = .5; seg(m0, m1, C.post, 4); ctx.restore(); }
  };
  const farWall = () => {
    for (const s of [-1, 1]) {
      const xa = s < 0 ? -1 : SIDEG, xb = s < 0 ? -SIDEG : 1;
      const A = P(xa,0,Z1), B = P(xb,0,Z1), g0 = P(xa,GH,Z1), g1 = P(xb,GH,Z1), m0 = P(xa,WALL,Z1), m1 = P(xb,WALL,Z1);
      glassQ(A, B, g1, g0, false); meshQ(g0, g1, m1, m0, 4, 2);
    }
    meshQ(P(-SIDEG,0,Z1), P(SIDEG,0,Z1), P(SIDEG,WALL,Z1), P(-SIDEG,WALL,Z1), 12, 6);
    seg(P(-1,WALL,Z1), P(1,WALL,Z1), C.edge, 1.4);
    for (const x of [-1, -SIDEG, SIDEG, 1]) seg(P(x,0,Z1), P(x,WALL,Z1), C.post, (x === -1 || x === 1) ? 2.2 : 1.2);
  };
  const net = () => {
    const a = P(0,0,Z0), b = P(0,0,Z1), t0 = P(0,NETH,Z0), t1 = P(0,NETH,Z1);
    fillQ(a, b, t1, t0, 'rgba(10,26,50,.5)');
    ctx.save(); qpath(a, b, t1, t0); ctx.clip();
    for (let z = Z0; z <= Z1; z += 0.055) seg(P(0,0,z), P(0,NETH,z), 'rgba(150,190,230,.4)', 1);
    for (let h = 0; h <= NETH + .001; h += NETH / 3) seg(P(0,h,Z0), P(0,h,Z1), 'rgba(150,190,230,.35)', 1);
    ctx.restore();
    seg(t0, t1, C.line, 2.2); seg(a, t0, C.post, 2.4); seg(b, t1, C.post, 2.4);
  };
  const drawPlayer = (p) => {
    const dim = win && win !== p.side;
    const base = P(p.x,0,p.z), x = base[0], y = base[1], sc = 1 - 0.16 * p.z;
    const bodyH = 9 * sc, headR = 2.4 * sc, topY = y - bodyH - 3 * sc;
    const skin = dim ? 'rgba(120,160,200,.5)' : '#eef5ff';
    const pad = dim ? 'rgba(120,160,200,.5)' : C.post;
    ctx.fillStyle = C.shadow; ctx.beginPath(); ctx.ellipse(x, y, 5 * sc, 2 * sc, 0, 0, 7); ctx.fill();
    ctx.fillStyle = skin; ctx.fillRect(x - 2 * sc, topY, 4 * sc, bodyH);
    ctx.beginPath(); ctx.arc(x, topY - headR, headR, 0, 7); ctx.fill();
    const bp = P(scene.ball.x, 0, scene.ball.z);
    const dx = bp[0] - x, dy = (bp[1] - (y - bodyH * 0.6)) * 0.35, d = Math.hypot(dx, dy) || 1;
    const reach = (3 + (p.swing || 0) * 6) * sc;
    const hx = x + (dx / d) * 3 * sc, hy = y - bodyH * 0.6, ex = hx + (dx / d) * reach, ey = hy + (dy / d) * reach;
    ctx.strokeStyle = skin; ctx.lineWidth = 1.6 * sc; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = pad; ctx.beginPath(); ctx.arc(ex, ey, 2.2 * sc, 0, 7); ctx.fill();
    if ((p.swing || 0) > 0.75) { ctx.save(); ctx.globalAlpha = (p.swing - 0.75) * 4; ctx.fillStyle = C.volt; ctx.beginPath(); ctx.arc(ex, ey, 3.6 * sc, 0, 7); ctx.fill(); ctx.restore(); }
  };

  // ---- paint ----
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0e1938'); bg.addColorStop(1, '#0a1226');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const fl = ctx.createRadialGradient(W/2, H*0.04, 10, W/2, H*0.04, H*0.9);
  fl.addColorStop(0, 'rgba(120,200,255,.10)'); fl.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = fl; ctx.fillRect(0, 0, W, H);

  const nL = P(-1,0,0), nR = P(1,0,0), fL = P(-1,0,1), fR = P(1,0,1);
  const fg = ctx.createLinearGradient(0, P(0,0,1)[1], 0, P(0,0,0)[1]);
  fg.addColorStop(0, '#154f92'); fg.addColorStop(1, '#1a63b5');
  fillQ(nL, nR, fR, fL, fg);
  if (win) { const mN = P(0,0,0), mF = P(0,0,1); win === 1 ? fillQ(nL, mN, mF, fL, C.hlA) : fillQ(mN, nR, fR, mF, C.hlB); }

  seg(P(-1,0,Z0), P(1,0,Z0), 'rgba(234,246,255,.8)', 1.4); seg(P(-1,0,Z1), P(1,0,Z1), 'rgba(234,246,255,.8)', 1.4);
  seg(P(-1,0,Z0), P(-1,0,Z1), 'rgba(234,246,255,.8)', 1.4); seg(P(1,0,Z0), P(1,0,Z1), 'rgba(234,246,255,.8)', 1.4);
  seg(P(-SRV,0,Z0), P(-SRV,0,Z1), C.line, 1.4); seg(P(SRV,0,Z0), P(SRV,0,Z1), C.line, 1.4);
  seg(P(-SRV,0,.5), P(SRV,0,.5), C.line, 1.4);

  farWall();
  net();

  const b = scene.ball, sh = P(b.x,0,b.z), bp = P(b.x,b.y,b.z);
  for (const p of scene.players) if (p.role === 'back') drawPlayer(p);
  for (const p of scene.players) if (p.role === 'net') drawPlayer(p);
  ctx.fillStyle = C.shadow; ctx.beginPath(); ctx.ellipse(sh[0], sh[1], 5, 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = C.volt; ctx.beginPath(); ctx.arc(bp[0], bp[1], 3.4, 0, 7); ctx.fill();

  endWall(-1, win === 1); endWall(1, win === 2);
  const r = 0.14; fillQ(P(-1,0,0), P(1,0,0), P(1,r,0), P(-1,r,0), 'rgba(120,205,250,0.05)');
  seg(P(-1,r,0), P(1,r,0), 'rgba(143,220,255,.45)', 1.2);
  for (const x of [-1, -SIDEG, SIDEG, 1]) seg(P(x,0,0), P(x,r,0), C.post, 1.6);
}
