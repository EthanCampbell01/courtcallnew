const router = require('express').Router();
const db = require('../db');
const { requireUser } = require('../util');
const { scoreFuture } = require('../scoring');

// The event's "final" is the match in its highest-order round. Once decided,
// its winner is the champion.
function eventChampion(eventId) {
  const finalRound = db
    .prepare('SELECT id FROM rounds WHERE event_id = ? ORDER BY order_index DESC, id DESC LIMIT 1')
    .get(eventId);
  if (!finalRound) return null;
  const finalMatch = db
    .prepare("SELECT * FROM matches WHERE round_id = ? AND winner IN (1,2) AND status != 'scheduled' ORDER BY completed_at DESC, id DESC LIMIT 1")
    .get(finalRound.id);
  if (!finalMatch) return null;
  return {
    name: finalMatch.winner === 1 ? finalMatch.player1 : finalMatch.player2,
    seed: finalMatch.winner === 1 ? finalMatch.seed1 : finalMatch.seed2,
  };
}

// distinct real players entered in an event (from its matches)
function eventEntrants(eventId) {
  const rows = db
    .prepare(
      `SELECT player1 AS p, seed1 AS s FROM matches m JOIN rounds r ON r.id = m.round_id WHERE r.event_id = ?
       UNION
       SELECT player2 AS p, seed2 AS s FROM matches m JOIN rounds r ON r.id = m.round_id WHERE r.event_id = ?`
    )
    .all(eventId, eventId);
  const seen = new Map();
  for (const { p, s } of rows) {
    if (!p || /^(tbd|bye)$/i.test(p.trim())) continue;
    if (!seen.has(p) || (s != null && seen.get(p) == null)) seen.set(p, s ?? null);
  }
  return [...seen.entries()]
    .map(([name, seed]) => ({ name, seed }))
    .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || a.name.localeCompare(b.name));
}

// futures lock once the event's earliest round deadline has passed (play started)
function eventLock(eventId) {
  const row = db.prepare('SELECT MIN(deadline) AS d FROM rounds WHERE event_id = ?').get(eventId);
  return row?.d || null;
}

// Score every futures pick for an event once its champion is known.
// Safe to call repeatedly (idempotent).
function scoreEventFutures(eventId) {
  const champ = eventChampion(eventId);
  if (!champ) return 0;
  const rows = db.prepare('SELECT * FROM futures WHERE event_id = ?').all(eventId);
  const upd = db.prepare('UPDATE futures SET points = ? WHERE id = ?');
  for (const f of rows) upd.run(scoreFuture(f.predicted_player, champ.name, champ.seed), f.id);
  return rows.length;
}

// GET the futures market for an event
router.get('/events/:id/futures', requireUser, (req, res) => {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const deadline = eventLock(ev.id);
  const locked = deadline ? new Date(deadline) <= new Date() : false;
  const champ = eventChampion(ev.id);
  const mine = db.prepare('SELECT * FROM futures WHERE user_id = ? AND event_id = ?').get(req.user.id, ev.id);
  res.json({
    event: { id: ev.id, type: ev.type, name: ev.name },
    deadline, locked,
    entrants: eventEntrants(ev.id),
    my_pick: mine ? mine.predicted_player : null,
    my_points: mine ? mine.points : null,
    champion: champ ? champ.name : null,
    decided: !!champ,
  });
});

// PUT / update your champion pick for an event
router.put('/events/:id/futures', requireUser, (req, res) => {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const deadline = eventLock(ev.id);
  if (deadline && new Date(deadline) <= new Date()) return res.status(403).json({ error: 'Futures are locked — play has started' });

  const player = String((req.body || {}).predicted_player || '').trim();
  if (!player) return res.status(400).json({ error: 'Pick a player' });
  const entrants = eventEntrants(ev.id).map((e) => e.name);
  if (!entrants.includes(player)) return res.status(400).json({ error: 'That player is not in this draw' });

  db.prepare(
    `INSERT INTO futures (user_id, event_id, predicted_player) VALUES (?,?,?)
     ON CONFLICT (user_id, event_id) DO UPDATE SET predicted_player = excluded.predicted_player, updated_at = datetime('now')`
  ).run(req.user.id, ev.id, player);
  res.json({ ok: true, predicted_player: player });
});

module.exports = router;
module.exports.scoreEventFutures = scoreEventFutures;
module.exports.eventChampion = eventChampion;
