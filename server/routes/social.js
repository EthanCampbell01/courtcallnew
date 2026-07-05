const router = require('express').Router();
const db = require('../db');
const { requireUser } = require('../util');

function userStats(userId) {
  const base = db
    .prepare(
      `SELECT COUNT(*) AS scored,
              COALESCE(SUM(points),0) AS total_points,
              COALESCE(AVG(points),0) AS avg_points,
              SUM(CASE WHEN json_extract(breakdown,'$.winner') = 10 THEN 1 ELSE 0 END) AS correct_winners,
              SUM(CASE WHEN json_extract(breakdown,'$.exact') = 15 THEN 1 ELSE 0 END) AS exact_scores,
              SUM(CASE WHEN json_extract(breakdown,'$.upset') = 8 THEN 1 ELSE 0 END) AS upsets_called,
              SUM(CASE WHEN json_extract(breakdown,'$.perfect') = 10 THEN 1 ELSE 0 END) AS perfect_calls,
              MAX(points) AS best_match
       FROM predictions WHERE user_id = ? AND points IS NOT NULL`
    )
    .get(userId);
  const pending = db
    .prepare(`SELECT COUNT(*) c FROM predictions WHERE user_id = ? AND points IS NULL`)
    .get(userId).c;
  const winRate = base.scored ? Math.round((100 * base.correct_winners) / base.scored) : 0;

  // current streak of correct winners (most recent scored predictions)
  const recent = db
    .prepare(
      `SELECT json_extract(p.breakdown,'$.winner') = 10 AS hit
       FROM predictions p JOIN matches m ON m.id = p.match_id
       WHERE p.user_id = ? AND p.points IS NOT NULL
       ORDER BY m.completed_at DESC, p.id DESC LIMIT 50`
    )
    .all(userId);
  let streak = 0;
  for (const r of recent) { if (r.hit) streak++; else break; }

  return { ...base, avg_points: Math.round(base.avg_points * 10) / 10, pending, win_rate: winRate, streak };
}

router.get('/stats/me', requireUser, (req, res) => {
  res.json({ user_id: req.user.id, username: req.user.username, ...userStats(req.user.id) });
});

router.get('/users/search', requireUser, (req, res) => {
  const q = `%${String(req.query.q || '').replace(/[%_]/g, '')}%`;
  const rows = db
    .prepare('SELECT id, username FROM users WHERE username LIKE ? AND id != ? ORDER BY username LIMIT 12')
    .all(q, req.user.id);
  res.json(rows);
});

// Head-to-head comparison between the caller and another user
router.get('/h2h/:userId', requireUser, (req, res) => {
  const other = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.userId);
  if (!other) return res.status(404).json({ error: 'User not found' });

  const mine = userStats(req.user.id);
  const theirs = userStats(other.id);

  // common scored matches: who out-predicted whom
  const common = db
    .prepare(
      `SELECT a.match_id, a.points AS my_points, b.points AS their_points,
              m.player1, m.player2, m.score, m.winner, t.name AS tournament_name
       FROM predictions a
       JOIN predictions b ON b.match_id = a.match_id AND b.user_id = ?
       JOIN matches m ON m.id = a.match_id
       JOIN rounds r ON r.id = m.round_id
       JOIN events e ON e.id = r.event_id
       JOIN tournaments t ON t.id = e.tournament_id
       WHERE a.user_id = ? AND a.points IS NOT NULL AND b.points IS NOT NULL
       ORDER BY m.completed_at DESC LIMIT 30`
    )
    .all(other.id, req.user.id);

  const record = { wins: 0, losses: 0, draws: 0 };
  for (const c of common) {
    if (c.my_points > c.their_points) record.wins++;
    else if (c.my_points < c.their_points) record.losses++;
    else record.draws++;
  }

  res.json({
    me: { user_id: req.user.id, username: req.user.username, ...mine },
    them: { user_id: other.id, username: other.username, ...theirs },
    record,
    common_matches: common,
  });
});

module.exports = router;
