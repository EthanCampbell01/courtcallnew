const router = require('express').Router();
const db = require('../db');
const { requireUser } = require('../util');

// Create a notification (also used as the hook point for web push later).
function notify(userId, type, payload = {}) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (user_id, type, payload) VALUES (?,?,?)').run(userId, type, JSON.stringify(payload));
}

// Notify circuit members who still have an un-picked match in any round whose
// deadline is within the next 2 hours. Runs on an interval; each round fires once.
function deadlineSweep() {
  try {
    const rounds = db.prepare(
      `SELECT r.id, r.name AS round_name, e.tournament_id, t.name AS tournament_name, t.circuit_id
       FROM rounds r JOIN events e ON e.id = r.event_id JOIN tournaments t ON t.id = e.tournament_id
       WHERE r.deadline_notified = 0
         AND datetime(r.deadline) > datetime('now')
         AND datetime(r.deadline) <= datetime('now', '+2 hours')`
    ).all();
    const usersFor = db.prepare(
      `SELECT DISTINCT uc.user_id FROM user_circuits uc
       WHERE uc.circuit_id = ?
         AND EXISTS (
           SELECT 1 FROM matches m
           WHERE m.round_id = ? AND m.status = 'scheduled'
             AND NOT EXISTS (SELECT 1 FROM predictions p WHERE p.match_id = m.id AND p.user_id = uc.user_id)
         )`
    );
    const flag = db.prepare('UPDATE rounds SET deadline_notified = 1 WHERE id = ?');
    for (const r of rounds) {
      for (const u of usersFor.all(r.circuit_id, r.id)) {
        notify(u.user_id, 'deadline', { round_name: r.round_name, tournament_name: r.tournament_name, tournament_id: r.tournament_id });
      }
      flag.run(r.id);
    }
  } catch (e) {
    console.error('[notify] deadline sweep failed:', e.message);
  }
}

router.get('/notifications', requireUser, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 40')
    .all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).c;
  res.json({ unread, notifications: rows.map((n) => ({ ...n, payload: JSON.parse(n.payload) })) });
});

router.post('/notifications/read', requireUser, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.notify = notify;
module.exports.deadlineSweep = deadlineSweep;
