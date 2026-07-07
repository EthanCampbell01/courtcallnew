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
    // --- glass-box enclosure ---
    // outer wall frame
    px(L, T, R - L + 1, 1, PAL.wall); px(L, B, R - L + 1, 1, PAL.wall);
    px(L, T, 1, B - T, PAL.wall); px(R, T, 1, B - T, PAL.wall);
    // the back walls (the ends you play off) glow brighter — the signature glass
    px(L, T + 1, 1, B - T - 1, PAL.glass); px(R, T + 1, 1, B - T - 1, PAL.glass);
    // frame posts where the glass panels meet (corners + mid-sides)
    for (const [x, y] of [[L, T], [R, T], [L, B], [R, B], [cx, T], [cx, B]]) px(x - 1, y - 1, 2, 2, PAL.post);
    // inset playing-court boundary (the gap reads as wall depth)
    px(L + 3, T + 3, R - L - 6, 1, PAL.line); px(L + 3, B - 3, R - L - 6, 1, PAL.line);
    px(L + 3, T + 3, 1, B - T - 6, PAL.line); px(R - 3, T + 3, 1, B - T - 6, PAL.line);
    // net down the middle + posts
    for (let ny = T + 3; ny < B - 2; ny += 2) px(cx, ny, 3, 1, PAL.net);
    px(cx - 3, T, 7, 3, PAL.post); px(cx - 3, B - 2, 7, 3, PAL.post);
    // service lines set back near each end (~30% from the wall) + centre service line
    const sL = L + ((cx - L) * 0.32 | 0), sR = R - ((R - cx) * 0.32 | 0);
    px(sL, T + 3, 1, B - T - 6, PAL.line); px(sR, T + 3, 1, B - T - 6, PAL.line);
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
