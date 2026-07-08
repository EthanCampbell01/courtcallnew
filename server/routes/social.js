const router = require('express').Router();
const db = require('../db');
const { requireUser } = require('../util');

// A player's record, optionally scoped to one sport (tennis | padel | null=all).
function userStats(userId, sport = null) {
  const p = { userId, sport: sport || null };
  const scope = `JOIN matches m ON m.id = p.match_id
       JOIN rounds r ON r.id = m.round_id
       JOIN events e ON e.id = r.event_id
       JOIN tournaments t ON t.id = e.tournament_id
       JOIN circuits c ON c.id = t.circuit_id`;
  const inSport = `(@sport IS NULL OR c.sport = @sport)`;
  const base = db
    .prepare(
      `SELECT COUNT(*) AS scored,
              COALESCE(SUM(p.points),0) AS total_points,
              COALESCE(AVG(p.points),0) AS avg_points,
              SUM(CASE WHEN json_extract(p.breakdown,'$.winner') = 10 THEN 1 ELSE 0 END) AS correct_winners,
              SUM(CASE WHEN json_extract(p.breakdown,'$.exact') = 15 THEN 1 ELSE 0 END) AS exact_scores,
              SUM(CASE WHEN json_extract(p.breakdown,'$.upset') = 8 THEN 1 ELSE 0 END) AS upsets_called,
              SUM(CASE WHEN json_extract(p.breakdown,'$.perfect') = 10 THEN 1 ELSE 0 END) AS perfect_calls,
              MAX(p.points) AS best_match
       FROM predictions p ${scope} WHERE p.user_id = @userId AND p.points IS NOT NULL AND ${inSport}`
    )
    .get(p);
  const pending = db
    .prepare(`SELECT COUNT(*) c FROM predictions p ${scope} WHERE p.user_id = @userId AND p.points IS NULL AND ${inSport}`)
    .get(p).c;
  const winRate = base.scored ? Math.round((100 * base.correct_winners) / base.scored) : 0;

  // current streak of correct winners (most recent scored predictions)
  const recent = db
    .prepare(
      `SELECT json_extract(p.breakdown,'$.winner') = 10 AS hit
       FROM predictions p ${scope}
       WHERE p.user_id = @userId AND p.points IS NOT NULL AND ${inSport}
       ORDER BY m.completed_at DESC, p.id DESC LIMIT 50`
    )
    .all(p);
  let streak = 0;
  for (const r of recent) { if (r.hit) streak++; else break; }

  // futures (champion) points fold into the headline total
  const fut = db
    .prepare(`SELECT COALESCE(SUM(f.points),0) AS pts, SUM(CASE WHEN f.points > 0 THEN 1 ELSE 0 END) AS hits
              FROM futures f
              JOIN events e ON e.id = f.event_id
              JOIN tournaments t ON t.id = e.tournament_id
              JOIN circuits c ON c.id = t.circuit_id
              WHERE f.user_id = @userId AND f.points IS NOT NULL AND ${inSport}`)
    .get(p);

  return {
    ...base,
    total_points: (base.total_points || 0) + (fut.pts || 0),
    futures_points: fut.pts || 0,
    futures_hits: fut.hits || 0,
    avg_points: Math.round(base.avg_points * 10) / 10,
    pending, win_rate: winRate, streak,
  };
}

const asSport = (s) => (s === 'tennis' || s === 'padel' ? s : null);

router.get('/stats/me', requireUser, (req, res) => {
  res.json({ user_id: req.user.id, username: req.user.username, ...userStats(req.user.id, asSport(req.query.sport)) });
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

  const sport = asSport(req.query.sport);
  const mine = userStats(req.user.id, sport);
  const theirs = userStats(other.id, sport);

  // common scored matches: who out-predicted whom
  const common = db
    .prepare(
      `SELECT a.match_id, a.points AS my_points, b.points AS their_points,
              m.player1, m.player2, m.score, m.winner, t.name AS tournament_name
       FROM predictions a
       JOIN predictions b ON b.match_id = a.match_id AND b.user_id = @other
       JOIN matches m ON m.id = a.match_id
       JOIN rounds r ON r.id = m.round_id
       JOIN events e ON e.id = r.event_id
       JOIN tournaments t ON t.id = e.tournament_id
       JOIN circuits c ON c.id = t.circuit_id
       WHERE a.user_id = @me AND a.points IS NOT NULL AND b.points IS NOT NULL AND (@sport IS NULL OR c.sport = @sport)
       ORDER BY m.completed_at DESC LIMIT 30`
    )
    .all({ other: Number(other.id), me: req.user.id, sport });

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
