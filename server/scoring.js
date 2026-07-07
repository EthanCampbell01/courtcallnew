// CourtCall scoring engine — max 48 pts per match
//   Correct winner ............ 10
//   Correct set count ..........  5
//   Correct exact scoreline .... 15
//   Upset bonus ................  8
//   Perfect (all three) bonus .. 10
// Walkovers/retirements award winner points only.

function normalizeScore(score) {
  if (!score) return null;
  return String(score)
    .trim()
    .toLowerCase()
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .split(' ')
    .map((set) => set.replace(/\(.*?\)/g, '')) // strip tiebreak detail e.g. 7-6(4)
    .join(' ');
}

function countSets(score) {
  const n = normalizeScore(score);
  if (!n) return null;
  return n.split(' ').filter((s) => /^\d+-\d+$/.test(s)).length || null;
}

function isUpset(match) {
  // winner unseeded beats seeded, or winner has a higher seed number (worse seed)
  const winnerSeed = match.winner === 1 ? match.seed1 : match.seed2;
  const loserSeed = match.winner === 1 ? match.seed2 : match.seed1;
  if (loserSeed == null) return false; // beat an unseeded player: never an upset
  if (winnerSeed == null) return true; // unseeded beat a seed
  return winnerSeed > loserSeed; // e.g. seed 7 beats seed 2
}

function scorePrediction(prediction, match) {
  const breakdown = { winner: 0, sets: 0, exact: 0, upset: 0, perfect: 0 };

  const winnerCorrect = prediction.predicted_winner === match.winner;
  if (winnerCorrect) breakdown.winner = 10;

  const terminated = match.status === 'walkover' || match.status === 'retired';
  if (!terminated && winnerCorrect) {
    const actualSets = match.set_count ?? countSets(match.score);
    const setsCorrect =
      prediction.predicted_sets != null && actualSets != null && prediction.predicted_sets === actualSets;
    if (setsCorrect) breakdown.sets = 5;

    const exactCorrect =
      prediction.predicted_score &&
      match.score &&
      normalizeScore(prediction.predicted_score) === normalizeScore(match.score);
    if (exactCorrect) breakdown.exact = 15;

    if (isUpset(match)) breakdown.upset = 8;
    if (setsCorrect && exactCorrect) breakdown.perfect = 10;
  } else if (terminated && winnerCorrect && isUpset(match)) {
    // winner points only on walkover/retirement — no set/score/upset extras
  }

  const points = breakdown.winner + breakdown.sets + breakdown.exact + breakdown.upset + breakdown.perfect;
  return { points, breakdown };
}

// Futures (event champion): correct call = 30, or 50 if the champion was
// unseeded (a bolder outsider call). Wrong = 0.
function scoreFuture(predictedPlayer, champion, championSeed) {
  if (!predictedPlayer || !champion) return 0;
  if (predictedPlayer.trim().toLowerCase() !== champion.trim().toLowerCase()) return 0;
  return championSeed == null ? 50 : 30;
}

module.exports = { scorePrediction, normalizeScore, countSets, isUpset, scoreFuture };
