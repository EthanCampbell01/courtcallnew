// Shared pixel court markings for the animated courts (FeaturedMatch, PixelCourt).
// px(x, y, w, h, colour) fills a rect on the low-res canvas.
// PAL supplies line / net / post colours (+ wall / glass for padel).
//
// Tennis and padel courts are genuinely different shapes, so we draw them
// differently rather than just recolouring:
//   tennis — baseline box, doubles tramlines, mid-court service boxes, open sides
//   padel  — a glass-walled box (double-framed, brighter back-wall glass), net,
//            and service lines set back near the walls with a centre line; no tramlines.
export function drawCourt(px, PAL, L, R, T, B, padel) {
  const cx = (L + R) / 2 | 0, cy = (T + B) / 2 | 0;

  if (padel) {
    // --- the padel cage: glass end-walls + mesh side-fencing enclosing the court ---
    const WT = 5;                         // wall thickness
    const iL = L + WT, iR = R - WT, iT = T + WT, iB = B - WT;

    // side fencing (top & bottom long sides): metal mesh
    px(L, T, R - L, WT, PAL.wall); px(L, B - WT, R - L, WT, PAL.wall);
    for (let x = L + 1; x < R; x += 3) { px(x, T + 1, 1, WT - 2, PAL.glass); px(x, B - WT + 1, 1, WT - 2, PAL.glass); }

    // back walls (the two ends you play off): tinted glass with panel seams
    px(L, T, WT, B - T, PAL.glass); px(R - WT, T, WT, B - T, PAL.glass);
    for (let y = T + 4; y < B - 2; y += 7) { px(L + 1, y, WT - 1, 1, PAL.line); px(R - WT, y, WT - 1, 1, PAL.line); }

    // bold corner posts + mid-side posts (where the panels bolt together)
    for (const [x, y] of [[L, T], [R - WT + 1, T], [L, B - WT + 1], [R - WT + 1, B - WT + 1]]) px(x, y, WT - 1, WT - 1, PAL.post);
    px(cx - 1, T, 3, WT, PAL.post); px(cx - 1, B - WT, 3, WT, PAL.post);

    // playing-court boundary just inside the cage
    px(iL, iT, iR - iL, 1, PAL.line); px(iL, iB, iR - iL, 1, PAL.line);
    px(iL, iT, 1, iB - iT, PAL.line); px(iR, iT, 1, iB - iT, PAL.line);

    // net down the middle + posts
    for (let ny = iT; ny < iB; ny += 2) px(cx, ny, 3, 1, PAL.net);
    px(cx - 3, T + 1, 7, 3, PAL.post); px(cx - 3, B - 4, 7, 3, PAL.post);

    // service lines set back near each end (~30% from the wall) + centre service line
    const sL = L + ((cx - L) * 0.34 | 0), sR = R - ((R - cx) * 0.34 | 0);
    px(sL, iT, 1, iB - iT, PAL.line); px(sR, iT, 1, iB - iT, PAL.line);
    px(sL, cy, sR - sL, 1, PAL.line);
    return;
  }

  // --- tennis ---
  px(L, T, R - L, 1, PAL.line); px(L, B, R - L, 1, PAL.line);
  px(L, T, 1, B - T, PAL.line); px(R, T, 1, B - T, PAL.line);
  px(L, T + 5, R - L, 1, PAL.line); px(L, B - 5, R - L, 1, PAL.line); // doubles tramlines
  const sL = L + ((cx - L) * 0.5 | 0), sR = R - ((R - cx) * 0.5 | 0);
  px(sL, T + 5, 1, (B - 5) - (T + 5), PAL.line); px(sR, T + 5, 1, (B - 5) - (T + 5), PAL.line);
  px(sL, cy, sR - sL, 1, PAL.line);
  for (let ny = T; ny < B; ny += 2) px(cx, ny, 3, 1, PAL.net);
  px(cx - 3, T - 2, 7, 3, PAL.post); px(cx - 3, B - 1, 7, 3, PAL.post);
}
