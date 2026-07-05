const router = require('express').Router();
const db = require('../db');
const { requireUser, EMOJIS } = require('../util');

function matchContext(matchId) {
  return db
    .prepare(
      `SELECT m.*, r.deadline, r.name AS round_name, e.name AS event_name, e.type AS event_type,
              t.name AS tournament_name, t.id AS tournament_id
       FROM matches m
       JOIN rounds r ON r.id = m.round_id
       JOIN events e ON e.id = r.event_id
       JOIN tournaments t ON t.id = e.tournament_id
       WHERE m.id = ?`
    )
    .get(matchId);
}

const isLocked = (m) => new Date(m.deadline) <= new Date();

// Create / update own prediction — rejected once the round deadline passes
router.put('/matches/:id/prediction', requireUser, (req, res) => {
  const match = matchContext(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (isLocked(match)) return res.status(403).json({ error: 'Predictions are locked for this round' });
  if (match.status !== 'scheduled') return res.status(403).json({ error: 'This match already has a result' });

  const { predicted_winner, predicted_sets, predicted_score } = req.body || {};
  if (![1, 2].includes(predicted_winner)) return res.status(400).json({ error: 'Pick a winner (1 or 2)' });
  if (predicted_sets != null && ![2, 3, 4, 5].includes(predicted_sets)) {
    return res.status(400).json({ error: 'Set count must be 2-5' });
  }
  if (predicted_score && !/^[\d\s()\-–,]{3,40}$/.test(predicted_score)) {
    return res.status(400).json({ error: 'Score format looks wrong — try e.g. 6-4 3-6 6-2' });
  }

  db.prepare(
    `INSERT INTO predictions (user_id, match_id, predicted_winner, predicted_sets, predicted_score)
     VALUES (?,?,?,?,?)
     ON CONFLICT (user_id, match_id) DO UPDATE SET
       predicted_winner = excluded.predicted_winner,
       predicted_sets = excluded.predicted_sets,
       predicted_score = excluded.predicted_score,
       updated_at = datetime('now')`
  ).run(req.user.id, match.id, predicted_winner, predicted_sets ?? null, predicted_score ?? null);

  res.json({ ok: true, prediction: db.prepare('SELECT * FROM predictions WHERE user_id = ? AND match_id = ?').get(req.user.id, match.id) });
});

router.delete('/matches/:id/prediction', requireUser, (req, res) => {
  const match = matchContext(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (isLocked(match)) return res.status(403).json({ error: 'Predictions are locked for this round' });
  db.prepare('DELETE FROM predictions WHERE user_id = ? AND match_id = ?').run(req.user.id, match.id);
  res.json({ ok: true });
});

// Other users' predictions for a match.
// REVEAL RULE: hidden until the match completes. Own prediction always visible.
router.get('/matches/:id/predictions', requireUser, (req, res) => {
  const match = matchContext(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const revealed = match.status !== 'scheduled';
  const rows = db
    .prepare(
      `SELECT p.id, p.user_id, u.username, p.predicted_winner, p.predicted_sets, p.predicted_score,
              p.points, p.breakdown, p.updated_at
       FROM predictions p JOIN users u ON u.id = p.user_id
       WHERE p.match_id = ? ORDER BY p.points DESC, p.updated_at`
    )
    .all(match.id);

  const reactionsStmt = db.prepare(
    `SELECT emoji, COUNT(*) AS count, MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
     FROM reactions WHERE prediction_id = ? GROUP BY emoji`
  );

  const out = rows
    .filter((p) => revealed || p.user_id === req.user.id)
    .map((p) => ({
      ...p,
      breakdown: p.breakdown ? JSON.parse(p.breakdown) : null,
      reactions: reactionsStmt.all(req.user.id, p.id),
      mine: p.user_id === req.user.id,
    }));

  res.json({
    revealed,
    locked: isLocked(match),
    hidden_count: revealed ? 0 : rows.filter((p) => p.user_id !== req.user.id).length,
    predictions: out,
  });
});

// The caller's prediction slate across joined circuits
router.get('/predictions/mine', requireUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, m.player1, m.player2, m.seed1, m.seed2, m.status, m.winner, m.score,
              r.deadline, r.name AS round_name, e.type AS event_type,
              t.name AS tournament_name, t.id AS tournament_id
       FROM predictions p
       JOIN matches m ON m.id = p.match_id
       JOIN rounds r ON r.id = m.round_id
       JOIN events e ON e.id = r.event_id
       JOIN tournaments t ON t.id = e.tournament_id
       WHERE p.user_id = ?
       ORDER BY CASE WHEN m.status = 'scheduled' THEN 0 ELSE 1 END, r.deadline`
    )
    .all(req.user.id);
  res.json(rows.map((p) => ({ ...p, breakdown: p.breakdown ? JSON.parse(p.breakdown) : null, locked: new Date(p.deadline) <= new Date() })));
});

// Matches still open for prediction (deadline in the future) in joined circuits
router.get('/predictions/open', requireUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, r.deadline, r.name AS round_name, e.type AS event_type,
              t.name AS tournament_name, t.id AS tournament_id,
              p.id AS my_prediction_id, p.predicted_winner, p.predicted_sets, p.predicted_score
       FROM matches m
       JOIN rounds r ON r.id = m.round_id
       JOIN events e ON e.id = r.event_id
       JOIN tournaments t ON t.id = e.tournament_id
       JOIN user_circuits uc ON uc.circuit_id = t.circuit_id AND uc.user_id = ?
       LEFT JOIN predictions p ON p.match_id = m.id AND p.user_id = ?
       WHERE m.status = 'scheduled' AND datetime(r.deadline) > datetime('now')
       ORDER BY r.deadline LIMIT 100`
    )
    .all(req.user.id, req.user.id);
  res.json(rows);
});

// Emoji reactions — one per user per prediction, fixed emoji set
router.post('/predictions/:id/react', requireUser, (req, res) => {
  const { emoji } = req.body || {};
  if (!EMOJIS.includes(emoji)) return res.status(400).json({ error: 'Unsupported emoji' });

  const pred = db.prepare('SELECT * FROM predictions WHERE id = ?').get(req.params.id);
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });
  const match = matchContext(pred.match_id);
  if (match.status === 'scheduled' && pred.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Picks are hidden until the match completes' });
  }

  const existing = db.prepare('SELECT * FROM reactions WHERE prediction_id = ? AND user_id = ?').get(pred.id, req.user.id);
  if (existing && existing.emoji === emoji) {
    db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id); // toggle off
    return res.json({ ok: true, removed: true });
  }
  db.prepare(
    `INSERT INTO reactions (prediction_id, user_id, emoji) VALUES (?,?,?)
     ON CONFLICT (prediction_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = datetime('now')`
  ).run(pred.id, req.user.id, emoji);
  res.json({ ok: true });
});

module.exports = router;
