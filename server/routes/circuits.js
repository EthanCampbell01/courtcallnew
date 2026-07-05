const router = require('express').Router();
const db = require('../db');
const { requireUser } = require('../util');

// All public circuits, with membership + tournament counts
router.get('/circuits', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM tournaments t WHERE t.circuit_id = c.id) AS tournament_count,
              (SELECT COUNT(*) FROM user_circuits uc WHERE uc.circuit_id = c.id) AS member_count
       FROM circuits c WHERE c.is_public = 1 ORDER BY c.name`
    )
    .all();
  const joined = req.user
    ? new Set(db.prepare('SELECT circuit_id FROM user_circuits WHERE user_id = ?').all(req.user.id).map((r) => r.circuit_id))
    : new Set();
  res.json(rows.map((c) => ({ ...c, joined: joined.has(c.id) })));
});

router.post('/circuits/:id/join', requireUser, (req, res) => {
  const circuit = db.prepare('SELECT * FROM circuits WHERE id = ? AND is_public = 1').get(req.params.id);
  if (!circuit) return res.status(404).json({ error: 'Circuit not found' });
  db.prepare('INSERT OR IGNORE INTO user_circuits (user_id, circuit_id) VALUES (?,?)').run(req.user.id, circuit.id);
  res.json({ ok: true, circuit });
});

router.post('/circuits/:id/leave', requireUser, (req, res) => {
  db.prepare('DELETE FROM user_circuits WHERE user_id = ? AND circuit_id = ?').run(req.user.id, req.params.id);
  res.json({ ok: true });
});

// Tournaments scoped to the user's joined circuits (or one circuit via ?circuit=)
router.get('/tournaments', requireUser, (req, res) => {
  const params = [req.user.id];
  let where = 'uc.user_id = ?';
  if (req.query.circuit) {
    where += ' AND t.circuit_id = ?';
    params.push(req.query.circuit);
  }
  const rows = db
    .prepare(
      `SELECT t.*, c.name AS circuit_name, c.slug AS circuit_slug,
              (SELECT COUNT(*) FROM events e WHERE e.tournament_id = t.id) AS event_count
       FROM tournaments t
       JOIN circuits c ON c.id = t.circuit_id
       JOIN user_circuits uc ON uc.circuit_id = t.circuit_id
       WHERE ${where}
       ORDER BY CASE t.status WHEN 'live' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END, t.start_date`
    )
    .all(...params);
  res.json(rows);
});

// Full tournament detail: events → rounds → matches (+ caller's predictions)
router.get('/tournaments/:id', requireUser, (req, res) => {
  const t = db
    .prepare('SELECT t.*, c.name AS circuit_name FROM tournaments t JOIN circuits c ON c.id = t.circuit_id WHERE t.id = ?')
    .get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });

  const events = db.prepare('SELECT * FROM events WHERE tournament_id = ? ORDER BY type').all(t.id);
  const roundsStmt = db.prepare('SELECT * FROM rounds WHERE event_id = ? ORDER BY order_index');
  const matchesStmt = db.prepare('SELECT * FROM matches WHERE round_id = ? ORDER BY id');
  const myPredStmt = db.prepare('SELECT * FROM predictions WHERE user_id = ? AND match_id = ?');

  const detail = events.map((e) => ({
    ...e,
    rounds: roundsStmt.all(e.id).map((r) => ({
      ...r,
      locked: new Date(r.deadline) <= new Date(),
      matches: matchesStmt.all(r.id).map((m) => ({
        ...m,
        my_prediction: req.user ? myPredStmt.get(req.user.id, m.id) || null : null,
        prediction_count: db.prepare('SELECT COUNT(*) c FROM predictions WHERE match_id = ?').get(m.id).c,
      })),
    })),
  }));
  res.json({ ...t, events: detail });
});

module.exports = router;
