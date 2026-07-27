const router = require('express').Router();
const db = require('../db');
const { requireAdmin } = require('../util');
const { applyMatchResult } = require('../results');
const { runDiscoveryCycle, runCycle } = require('../scraper');

router.use(requireAdmin);

// Where a round sits in a draw, used as order_index so rounds always read in
// playing order regardless of the order the scraper happened to see them in.
const ROUND_LADDER = ['Group', 'Round of 128', 'Round of 64', 'Round of 32', 'Round of 16', 'Quarter-Final', 'Semi-Final', 'Final'];
const roundRank = (name) => {
  const i = ROUND_LADDER.indexOf(name);
  return i === -1 ? 50 : i;
};

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

  const result = applyMatchResult(match.id, { winner, score, status: finalStatus });
  res.json({ ok: true, scored_predictions: result.scored, scored_futures: result.futuresScored });
});

// ---- bulk import (Chrome extension / scraper) ----
// payload: { circuit_id, tournament: {name, venue, start_date, end_date, source_url},
//            events: [{ type, name, rounds: [{ name, deadline, matches: [{player1,player2,seed1,seed2}] }] }] }
router.post('/import', (req, res) => {
  const { circuit_id, tournament, events, replace } = req.body || {};
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

    let created = { events: 0, rounds: 0, matches: 0, skipped: 0, results: 0, moved: 0, removed: 0 };
    // A source row carries a result worth applying when it names a valid winner
    // and the score (if any) passes the same shape check as manual entry.
    const rowResult = (m) => {
      if (![1, 2].includes(m.winner)) return null;
      const status = ['completed', 'walkover', 'retired'].includes(m.result_status) ? m.result_status : 'completed';
      const score = m.score && /^[\d\s()\-–—,;]{3,40}$/.test(String(m.score)) ? String(m.score) : null;
      if (status === 'completed' && !score) return null;
      return { winner: m.winner, score, status };
    };
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
      const rds = (ev.rounds || []).filter((rd) => rd.name);
      const roundIds = new Map();
      for (const rd of rds) {
        // Order by where the round sits in a draw, not by arrival order: a draw
        // gains columns as it progresses, so import order says nothing about it.
        const rank = roundRank(rd.name);
        let r = db.prepare('SELECT * FROM rounds WHERE event_id = ? AND name = ?').get(e.id, rd.name);
        if (!r) {
          const deadline = rd.deadline && !isNaN(Date.parse(rd.deadline))
            ? new Date(rd.deadline).toISOString()
            : new Date(Date.now() + 7 * 86400000).toISOString();
          const info = db.prepare('INSERT INTO rounds (event_id, name, deadline, order_index) VALUES (?,?,?,?)').run(e.id, rd.name, deadline, rank);
          r = { id: info.lastInsertRowid };
          created.rounds++;
        } else if (r.order_index !== rank) {
          db.prepare('UPDATE rounds SET order_index = ? WHERE id = ?').run(rank, r.id);
        }
        roundIds.set(rd.name, r.id);
      }

      // Claim one existing row per payload match. Claiming (rather than matching
      // on players alone) is what lets stale duplicates be cleaned up: an earlier
      // shape of the page can leave a second row for the same pair, and only the
      // row the source actually accounts for gets to stay.
      const eventRows = db.prepare(
        `SELECT m.* FROM matches m JOIN rounds r ON r.id = m.round_id WHERE r.event_id = ?`
      ).all(e.id);
      // Where an earlier shape of the page left two rows for the same tie, keep
      // the one people actually predicted on — the loser of this choice is
      // deleted, and a pick must not be thrown away to tidy up duplicates.
      const predCount = new Map(
        db.prepare(
          `SELECT m.id AS id, COUNT(p.id) AS c FROM matches m
           JOIN rounds r ON r.id = m.round_id
           LEFT JOIN predictions p ON p.match_id = m.id
           WHERE r.event_id = ? GROUP BY m.id`
        ).all(e.id).map((r) => [r.id, r.c])
      );
      const claimed = new Set();
      const claim = (p1, p2, roundId) => {
        const cands = eventRows.filter((x) => !claimed.has(x.id) && x.player1 === p1 && x.player2 === p2);
        if (!cands.length) return null;
        cands.sort((a, b) =>
          (predCount.get(b.id) || 0) - (predCount.get(a.id) || 0) ||
          Number(b.round_id === roundId) - Number(a.round_id === roundId) ||
          a.id - b.id);
        claimed.add(cands[0].id);
        return cands[0];
      };

      for (const rd of rds) {
        const roundId = roundIds.get(rd.name);
        for (const m of rd.matches || []) {
          if (!m.player1 || !m.player2) continue;
          const result = rowResult(m);
          // TI re-files a match as the draw grows (a 2-column draw's "Semi-Final"
          // becomes "Quarter-Final" once a third column appears), so move the
          // existing row rather than insert — that keeps everyone's predictions
          // and points attached to it.
          const existing = claim(m.player1, m.player2, roundId);
          if (existing) {
            if (existing.round_id !== roundId) {
              db.prepare('UPDATE matches SET round_id = ? WHERE id = ?').run(roundId, existing.id);
              created.moved++;
            } else created.skipped++;
            if (m.seed1 != null || m.seed2 != null) {
              db.prepare('UPDATE matches SET seed1 = ?, seed2 = ? WHERE id = ?')
                .run(m.seed1 ?? existing.seed1 ?? null, m.seed2 ?? existing.seed2 ?? null, existing.id);
            }
            if (result && (existing.status === 'scheduled' || existing.winner !== result.winner || (result.score && result.score !== existing.score))) {
              applyMatchResult(existing.id, result);
              created.results++;
            }
            continue;
          }
          const info = db.prepare('INSERT INTO matches (round_id, player1, player2, seed1, seed2) VALUES (?,?,?,?,?)')
            .run(roundId, m.player1, m.player2, m.seed1 ?? null, m.seed2 ?? null);
          created.matches++;
          if (result) { applyMatchResult(info.lastInsertRowid, result); created.results++; }
        }
      }

      // The scraper owns a draw outright, so anything it no longer lists is a
      // leftover from an earlier shape of the page (the ghost "Group" round a
      // bracket leaves behind before its columns exist). Only ever on request,
      // and never when the payload is empty, so a bad scrape cannot wipe a draw.
      if (replace && claimed.size) {
        const del = db.prepare('DELETE FROM matches WHERE id = ?');
        for (const row of eventRows) {
          if (!claimed.has(row.id)) { del.run(row.id); created.removed++; }
        }
        db.prepare('DELETE FROM rounds WHERE event_id = ? AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.round_id = rounds.id)').run(e.id);
      }
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
