const router = require('express').Router();
const db = require('../db');
const { requireUser, generateInviteCode } = require('../util');

function logActivity(leagueId, userId, type, payload = {}) {
  db.prepare('INSERT INTO activity (league_id, user_id, type, payload) VALUES (?,?,?,?)').run(
    leagueId, userId, type, JSON.stringify(payload)
  );
}

router.get('/leagues', requireUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT l.*, c.name AS circuit_name, t.name AS tournament_name,
              (SELECT COUNT(*) FROM league_members lm2 WHERE lm2.league_id = l.id) AS member_count
       FROM leagues l
       JOIN league_members lm ON lm.league_id = l.id AND lm.user_id = ?
       LEFT JOIN circuits c ON c.id = l.circuit_id
       LEFT JOIN tournaments t ON t.id = l.tournament_id
       ORDER BY l.created_at DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

// Leagues are scoped to a single tournament — its leaderboard only counts
// predictions made on that tournament's matches.
router.post('/leagues', requireUser, (req, res) => {
  const { name, tournament_id, buy_in } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'League name is too short' });
  if (!tournament_id) return res.status(400).json({ error: 'Pick a tournament for this league' });
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournament_id);
  if (!tournament) return res.status(400).json({ error: 'Unknown tournament' });
  const buyIn = Number(buy_in) || 0;
  if (buyIn < 0 || buyIn > 10000) return res.status(400).json({ error: 'Buy-in must be between 0 and 10,000' });

  let code;
  do { code = generateInviteCode(); } while (db.prepare('SELECT 1 FROM leagues WHERE invite_code = ?').get(code));

  const info = db
    .prepare('INSERT INTO leagues (name, circuit_id, tournament_id, invite_code, buy_in, created_by) VALUES (?,?,?,?,?,?)')
    .run(String(name).trim(), tournament.circuit_id, tournament_id, code, buyIn, req.user.id);
  db.prepare('INSERT INTO league_members (league_id, user_id) VALUES (?,?)').run(info.lastInsertRowid, req.user.id);
  logActivity(info.lastInsertRowid, req.user.id, 'league_created', { name: String(name).trim() });

  res.status(201).json(db.prepare('SELECT * FROM leagues WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/leagues/join', requireUser, (req, res) => {
  const code = String((req.body || {}).invite_code || '').trim().toUpperCase();
  const league = db.prepare('SELECT * FROM leagues WHERE invite_code = ?').get(code);
  if (!league) return res.status(404).json({ error: 'No league found for that code' });
  const already = db.prepare('SELECT 1 FROM league_members WHERE league_id = ? AND user_id = ?').get(league.id, req.user.id);
  if (already) return res.status(409).json({ error: 'You are already in this league' });
  db.prepare('INSERT INTO league_members (league_id, user_id) VALUES (?,?)').run(league.id, req.user.id);
  logActivity(league.id, req.user.id, 'member_joined', { username: req.user.username });
  res.json({ ok: true, league });
});

router.post('/leagues/:id/leave', requireUser, (req, res) => {
  db.prepare('DELETE FROM league_members WHERE league_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  logActivity(Number(req.params.id), req.user.id, 'member_left', { username: req.user.username });
  res.json({ ok: true });
});

// League detail: leaderboard sorted by total points + activity feed
router.get('/leagues/:id', requireUser, (req, res) => {
  const league = db
    .prepare(
      `SELECT l.*, c.name AS circuit_name, t.name AS tournament_name
       FROM leagues l
       LEFT JOIN circuits c ON c.id = l.circuit_id
       LEFT JOIN tournaments t ON t.id = l.tournament_id
       WHERE l.id = ?`
    )
    .get(req.params.id);
  if (!league) return res.status(404).json({ error: 'League not found' });
  const isMember = db.prepare('SELECT 1 FROM league_members WHERE league_id = ? AND user_id = ?').get(league.id, req.user.id);
  if (!isMember) return res.status(403).json({ error: 'Join this league to see it' });

  // Points count only predictions within the league's scope: its tournament if
  // set, else its circuit (legacy leagues), else every tournament (global).
  const scoped = `FROM predictions p
       JOIN matches m ON m.id = p.match_id
       JOIN rounds r ON r.id = m.round_id
       JOIN events e ON e.id = r.event_id
       JOIN tournaments t ON t.id = e.tournament_id
       WHERE p.user_id = u.id AND p.points IS NOT NULL
         AND (
           (@tournament IS NOT NULL AND t.id = @tournament)
           OR (@tournament IS NULL AND (@circuit IS NULL OR t.circuit_id = @circuit))
         )`;
  const leaderboard = db
    .prepare(
      `SELECT u.id AS user_id, u.username,
              COALESCE((SELECT SUM(p.points) ${scoped}), 0) AS total_points,
              (SELECT COUNT(*) ${scoped}) AS scored_predictions,
              (SELECT COUNT(*) ${scoped} AND json_extract(p.breakdown,'$.winner') = 10) AS correct_winners,
              (SELECT COUNT(*) ${scoped} AND json_extract(p.breakdown,'$.perfect') = 10) AS perfect_calls
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       WHERE lm.league_id = @league
       GROUP BY u.id ORDER BY total_points DESC, perfect_calls DESC, u.username`
    )
    .all({ league: league.id, circuit: league.circuit_id ?? null, tournament: league.tournament_id ?? null });

  const feed = db
    .prepare(
      `SELECT a.*, u.username FROM activity a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.league_id = ? ORDER BY a.created_at DESC LIMIT 40`
    )
    .all(league.id)
    .map((a) => ({ ...a, payload: JSON.parse(a.payload) }));

  res.json({ ...league, member_count: leaderboard.length, leaderboard, feed });
});

module.exports = router;
module.exports.logActivity = logActivity;
