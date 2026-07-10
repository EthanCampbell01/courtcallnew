const router = require('express').Router();
const db = require('../db');
const { requireAdmin } = require('../util');
const { scorePrediction, countSets } = require('../scoring');
const { logActivity } = require('./leagues');
const { scoreEventFutures } = require('./futures');
const { notify } = require('./notifications');
const { runDiscoveryCycle, runCycle } = require('../scraper');

router.use(requireAdmin);

// Manually kick a discovery + draw-sync cycle (fire-and-forget) — handy for
// pulling a just-published draw immediately instead of waiting for the timer.
router.post('/scrape', (req, res) => {
  res.json({ ok: true, running: true });
  (async () => {
    try { await runDiscoveryCycle(); await runCycle(); console.log('[admin] manual scrape complete'); }
    catch (e) { console.error('[admin] manual scrape failed:', e.message); }
  })();
});

// ---- hierarchy CRUD ----
router.post('/tournaments', (req, res) => {
  const { circuit_id, name, venue, start_date, end_date, status } = req.body || {};
  if (!circuit_id || !name) return res.status(400).json({ error: 'circuit_id and name are required' });
  const info = db
    .prepare('INSERT INTO tournaments (circuit_id, name, venue, start_date, end_date, status) VALUES (?,?,?,?,?,?)')
    .run(circuit_id, name, venue || '', start_date || null, end_date || null, status || 'upcoming');
  res.status(201).json(db.prepare('SELECT * FROM tournaments WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/tournaments/:id', (req, res) => {
  const allowed = ['name', 'venue', 'start_date', 'end_date', 'status', 'circuit_id'];
  const sets = allowed.filter((k) => k in (req.body || {}));
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  db.prepare(`UPDATE tournaments SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...sets.map((k) => req.body[k]), req.params.id);
  res.json(db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id));
});

router.delete('/tournaments/:id', (req, res) => {
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/events', (req, res) => {
  const { tournament_id, type, name } = req.body || {};
  if (!tournament_id || !['MS', 'WS', 'MD', 'WD', 'XD'].includes(type)) {
    return res.status(400).json({ error: 'tournament_id and a valid type (MS/WS/MD/WD/XD) are required' });
  }
  const info = db.prepare('INSERT INTO events (tournament_id, type, name) VALUES (?,?,?)')
    .run(tournament_id, type, name || type);
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/rounds', (req, res) => {
  const { event_id, name, deadline, order_index } = req.body || {};
  if (!event_id || !name || !deadline) return res.status(400).json({ error: 'event_id, name and deadline are required' });
  if (isNaN(Date.parse(deadline))) return res.status(400).json({ error: 'Deadline must be a valid date-time' });
  const info = db.prepare('INSERT INTO rounds (event_id, name, deadline, order_index) VALUES (?,?,?,?)')
    .run(event_id, name, new Date(deadline).toISOString(), order_index ?? 0);
  res.status(201).json(db.prepare('SELECT * FROM rounds WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/rounds/:id', (req, res) => {
  const { deadline, name } = req.body || {};
  if (deadline) {
    if (isNaN(Date.parse(deadline))) return res.status(400).json({ error: 'Deadline must be a valid date-time' });
    db.prepare('UPDATE rounds SET deadline = ? WHERE id = ?').run(new Date(deadline).toISOString(), req.params.id);
  }
  if (name) db.prepare('UPDATE rounds SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json(db.prepare('SELECT * FROM rounds WHERE id = ?').get(req.params.id));
});

router.post('/matches', (req, res) => {
  const { round_id, player1, player2, seed1, seed2 } = req.body || {};
  if (!round_id || !player1 || !player2) return res.status(400).json({ error: 'round_id, player1 and player2 are required' });
  const info = db.prepare('INSERT INTO matches (round_id, player1, player2, seed1, seed2) VALUES (?,?,?,?,?)')
    .run(round_id, player1, player2, seed1 ?? null, seed2 ?? null);
  res.status(201).json(db.prepare('SELECT * FROM matches WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/matches/:id', (req, res) => {
  db.prepare('DELETE FROM matches WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- result entry → auto-score every prediction on that match ----
router.post('/matches/:id/result', (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const { winner, score, status } = req.body || {};
  const finalStatus = status || 'completed';
  if (!['completed', 'walkover', 'retired'].includes(finalStatus)) {
    return res.status(400).json({ error: 'status must be completed, walkover or retired' });
  }
  if (![1, 2].includes(winner)) return res.status(400).json({ error: 'winner must be 1 or 2' });
  if (finalStatus === 'completed' && !score) return res.status(400).json({ error: 'A score is required for completed matches' });
  if (score && !/^[\d\s()\-–—,;]{3,40}$/.test(String(score))) {
    return res.status(400).json({ error: 'Score format looks wrong — try e.g. 6-4 3-6 7-6(4)' });
  }

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

  const result = scoreAll();
  res.json({ ok: true, scored_predictions: result.scored, scored_futures: result.futuresScored });
});

// ---- bulk import (Chrome extension / scraper) ----
// payload: { circuit_id, tournament: {name, venue, start_date, end_date, source_url},
//            events: [{ type, name, rounds: [{ name, deadline, matches: [{player1,player2,seed1,seed2}] }] }] }
router.post('/import', (req, res) => {
  const { circuit_id, tournament, events } = req.body || {};
  if (!circuit_id || !tournament?.name || !Array.isArray(events)) {
    return res.status(400).json({ error: 'circuit_id, tournament.name and events[] are required' });
  }
  const circuit = db.prepare('SELECT id FROM circuits WHERE id = ?').get(circuit_id);
  if (!circuit) return res.status(400).json({ error: 'Unknown circuit_id' });

  const run = db.transaction(() => {
    let t = tournament.source_url
      ? db.prepare('SELECT * FROM tournaments WHERE source_url = ?').get(tournament.source_url)
      : db.prepare('SELECT * FROM tournaments WHERE circuit_id = ? AND name = ?').get(circuit_id, tournament.name);
    if (!t) {
      const info = db
        .prepare('INSERT INTO tournaments (circuit_id, name, venue, start_date, end_date, source_url) VALUES (?,?,?,?,?,?)')
        .run(circuit_id, tournament.name, tournament.venue || '', tournament.start_date || null, tournament.end_date || null, tournament.source_url || null);
      t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(info.lastInsertRowid);
    }

    let created = { events: 0, rounds: 0, matches: 0, skipped: 0 };
    for (const ev of events) {
      if (!['MS', 'WS', 'MD', 'WD', 'XD'].includes(ev.type)) continue;
      // match by type AND name so distinct draws of the same type (e.g. "Men's
      // Doubles" vs "Men's Doubles Handicap") stay separate events
      const evName = ev.name || ev.type;
      let e = db.prepare('SELECT * FROM events WHERE tournament_id = ? AND type = ? AND name = ?').get(t.id, ev.type, evName);
      if (!e) {
        const info = db.prepare('INSERT INTO events (tournament_id, type, name) VALUES (?,?,?)').run(t.id, ev.type, evName);
        e = { id: info.lastInsertRowid };
        created.events++;
      }
      (ev.rounds || []).forEach((rd, idx) => {
        if (!rd.name) return;
        let r = db.prepare('SELECT * FROM rounds WHERE event_id = ? AND name = ?').get(e.id, rd.name);
        if (!r) {
          const deadline = rd.deadline && !isNaN(Date.parse(rd.deadline))
            ? new Date(rd.deadline).toISOString()
            : new Date(Date.now() + 7 * 86400000).toISOString();
          const info = db.prepare('INSERT INTO rounds (event_id, name, deadline, order_index) VALUES (?,?,?,?)').run(e.id, rd.name, deadline, idx);
          r = { id: info.lastInsertRowid };
          created.rounds++;
        }
        for (const m of rd.matches || []) {
          if (!m.player1 || !m.player2) continue;
          const dup = db
            .prepare('SELECT 1 FROM matches WHERE round_id = ? AND player1 = ? AND player2 = ?')
            .get(r.id, m.player1, m.player2);
          if (dup) { created.skipped++; continue; }
          db.prepare('INSERT INTO matches (round_id, player1, player2, seed1, seed2) VALUES (?,?,?,?,?)')
            .run(r.id, m.player1, m.player2, m.seed1 ?? null, m.seed2 ?? null);
          created.matches++;
        }
      });
    }
    return { tournament_id: t.id, ...created };
  });

  res.status(201).json(run());
});

// list users for the admin panel
router.get('/users', (req, res) => {
  res.json(db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY username').all());
});

// grant or revoke admin access
router.post('/users/:id/set-admin', (req, res) => {
  const isAdmin = !!(req.body || {}).is_admin;
  if (!isAdmin && req.user && Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "You can't remove your own admin access" });
  }
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// list everything for the panel
router.get('/overview', (req, res) => {
  const circuits = db.prepare('SELECT * FROM circuits ORDER BY name').all();
  const tournaments = db.prepare('SELECT * FROM tournaments ORDER BY start_date DESC').all();
  const counts = {
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    predictions: db.prepare('SELECT COUNT(*) c FROM predictions').get().c,
    matches_pending: db.prepare("SELECT COUNT(*) c FROM matches WHERE status = 'scheduled'").get().c,
  };
  res.json({ circuits, tournaments, counts });
});

module.exports = router;
