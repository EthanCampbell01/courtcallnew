// Applying a match result — one code path shared by the admin result endpoint and
// the scraper import, so auto-synced results score predictions, notify, log league
// activity and settle futures exactly like manually entered ones.
const db = require('./db');
const { scorePrediction, countSets } = require('./scoring');
const { logActivity } = require('./routes/leagues');
const { scoreEventFutures } = require('./routes/futures');
const { notify } = require('./routes/notifications');

// status: 'completed' | 'walkover' | 'retired'; winner: 1 | 2; score: string | null.
// Returns { scored, futuresScored }. Re-applying to an already-decided match
// re-scores silently (no repeat notifications/activity).
function applyMatchResult(matchId, { winner, score, status }) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) throw new Error(`Match ${matchId} not found`);
  const finalStatus = status || 'completed';

  // Only fire notifications / activity the first time a match is decided, so
  // correcting a score later re-scores silently instead of re-spamming everyone.
  const firstResult = match.status === 'scheduled';
  const setCount = countSets(score);
  const scoreAll = db.transaction(() => {
    db.prepare(
      `UPDATE matches SET status = ?, winner = ?, score = ?, set_count = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(finalStatus, winner, score || null, setCount, match.id);

    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
    const ctx = db.prepare(
      `SELECT e.type AS event_type, t.name AS tournament_name, t.id AS tournament_id
       FROM rounds r JOIN events e ON e.id = r.event_id JOIN tournaments t ON t.id = e.tournament_id
       WHERE r.id = ?`
    ).get(updated.round_id) || {};
    const preds = db.prepare('SELECT * FROM predictions WHERE match_id = ?').all(match.id);
    const upd = db.prepare('UPDATE predictions SET points = ?, breakdown = ? WHERE id = ?');
    for (const p of preds) {
      const { points, breakdown } = scorePrediction(p, updated);
      upd.run(points, JSON.stringify(breakdown), p.id);
      if (firstResult) notify(p.user_id, 'scored', {
        match_id: match.id, player1: updated.player1, player2: updated.player2,
        points, tournament_name: ctx.tournament_name, tournament_id: ctx.tournament_id,
      });
    }

    // activity feed entries for every league each predictor belongs to
    const leaguesFor = db.prepare('SELECT league_id FROM league_members WHERE user_id = ?');
    const seen = new Set();
    if (firstResult) for (const p of preds) {
      for (const { league_id } of leaguesFor.all(p.user_id)) {
        const key = `${league_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        logActivity(league_id, null, 'result', {
          match_id: match.id,
          player1: updated.player1,
          player2: updated.player2,
          winner: winner === 1 ? updated.player1 : updated.player2,
          score: score || finalStatus,
        });
      }
    }
    // if this was an event's final, the winner is the champion → score futures
    const rnd = db.prepare('SELECT event_id, order_index FROM rounds WHERE id = ?').get(updated.round_id);
    let futuresScored = 0;
    if (rnd) {
      const maxOrder = db.prepare('SELECT MAX(order_index) AS m FROM rounds WHERE event_id = ?').get(rnd.event_id).m;
      if (rnd.order_index === maxOrder) {
        const fr = scoreEventFutures(rnd.event_id);
        futuresScored = fr.scored.length;
        if (firstResult) for (const s of fr.scored) {
          if (s.points > 0) notify(s.user_id, 'futures_scored', {
            champion: fr.champion, event_type: ctx.event_type, tournament_name: ctx.tournament_name,
            tournament_id: ctx.tournament_id, points: s.points,
          });
        }
      }
    }
    return { scored: preds.length, futuresScored };
  });

  return scoreAll();
}

module.exports = { applyMatchResult };
