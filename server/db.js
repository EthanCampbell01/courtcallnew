const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { hashPin, generateInviteCode } = require('./util');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'courtcall.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pin_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS circuits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_circuits (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  circuit_id INTEGER NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, circuit_id)
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  circuit_id INTEGER NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  venue TEXT DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','completed')),
  source_url TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('MS','WS','MD','WD','XD')),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  deadline TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player1 TEXT NOT NULL,
  player2 TEXT NOT NULL,
  seed1 INTEGER,
  seed2 INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','walkover','retired')),
  winner INTEGER CHECK (winner IN (1,2)),
  score TEXT,
  set_count INTEGER,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  predicted_winner INTEGER NOT NULL CHECK (predicted_winner IN (1,2)),
  predicted_sets INTEGER,
  predicted_score TEXT,
  points INTEGER,
  breakdown TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, match_id)
);

CREATE TABLE IF NOT EXISTS leagues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  circuit_id INTEGER REFERENCES circuits(id) ON DELETE SET NULL,
  invite_code TEXT NOT NULL UNIQUE,
  buy_in REAL NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS league_members (
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (league_id, user_id)
);

CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_id INTEGER NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (prediction_id, user_id)
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scrape_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run TEXT
);

CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round_id);
CREATE INDEX IF NOT EXISTS idx_activity_league ON activity(league_id, created_at);
`);

function seed() {
  const circuitCount = db.prepare('SELECT COUNT(*) c FROM circuits').get().c;
  if (circuitCount > 0) return;

  const insCircuit = db.prepare(
    'INSERT INTO circuits (name, slug, description, is_public) VALUES (?,?,?,1)'
  );
  const circuits = [
    ['Ulster TI', 'ulster-ti', 'Tennis Ireland Ulster branch open tournaments'],
    ['Leinster TI', 'leinster-ti', 'Tennis Ireland Leinster branch open tournaments'],
    ['Munster TI', 'munster-ti', 'Tennis Ireland Munster branch open tournaments'],
    ['BUCS', 'bucs', 'British Universities & Colleges Sport tennis'],
  ];
  const ids = {};
  for (const [name, slug, desc] of circuits) ids[slug] = insCircuit.run(name, slug, desc).lastInsertRowid;

  // Demo user (not admin — first *registered* user becomes admin)
  const demoId = db
    .prepare('INSERT INTO users (username, pin_hash, is_admin) VALUES (?,?,0)')
    .run('demo', hashPin('0000')).lastInsertRowid;
  db.prepare('INSERT INTO user_circuits (user_id, circuit_id) VALUES (?,?)').run(demoId, ids['ulster-ti']);

  // Demo league
  const leagueId = db
    .prepare('INSERT INTO leagues (name, circuit_id, invite_code, buy_in, created_by) VALUES (?,?,?,?,?)')
    .run('Demo League', ids['ulster-ti'], 'TENNIS', 0, demoId).lastInsertRowid;
  db.prepare('INSERT INTO league_members (league_id, user_id) VALUES (?,?)').run(leagueId, demoId);

  // Demo tournaments in Ulster TI
  const insT = db.prepare(
    "INSERT INTO tournaments (circuit_id, name, venue, start_date, end_date, status) VALUES (?,?,?,?,?,?)"
  );
  const insE = db.prepare('INSERT INTO events (tournament_id, type, name) VALUES (?,?,?)');
  const insR = db.prepare('INSERT INTO rounds (event_id, name, deadline, order_index) VALUES (?,?,?,?)');
  const insM = db.prepare(
    'INSERT INTO matches (round_id, player1, player2, seed1, seed2) VALUES (?,?,?,?,?)'
  );

  const now = Date.now();
  const days = (n) => new Date(now + n * 86400000).toISOString();

  const demoTournaments = [
    ['Ballycastle Open', 'Ballycastle Tennis Club', 2, 5, 'live'],
    ['CIYMS Open', 'CIYMS, Belfast', 9, 12, 'upcoming'],
    ['Cavehill Open', 'Cavehill LTC', 16, 19, 'upcoming'],
    ['Belfast Boat Club Open', 'Belfast Boat Club', 23, 26, 'upcoming'],
  ];

  const samplePlayers = [
    ['J. McAllister', 'C. Doyle', 1, null],
    ['R. Hughes', 'P. Lynch', null, 8],
    ['S. Campbell', 'D. Quinn', 4, null],
    ['M. O\u2019Neill', 'T. Magee', null, null],
    ['A. Donnelly', 'K. Murphy', 2, null],
    ['L. Patterson', 'B. Walsh', null, 6],
    ['E. Gallagher', 'F. Boyd', 5, null],
    ['G. Hamilton', 'N. Kerr', null, 3],
  ];

  demoTournaments.forEach(([name, venue, s, e, status], ti) => {
    const tid = insT.run(ids['ulster-ti'], name, venue, days(s).slice(0, 10), days(e).slice(0, 10), status).lastInsertRowid;
    for (const type of ['MS', 'WS']) {
      const eid = insE.run(tid, type, type === 'MS' ? 'Men\u2019s Singles' : 'Women\u2019s Singles').lastInsertRowid;
      const r1 = insR.run(eid, 'Round 1', days(s + ti), 0).lastInsertRowid;
      const qf = insR.run(eid, 'Quarter-finals', days(s + ti + 1), 1).lastInsertRowid;
      samplePlayers.slice(0, 4).forEach(([p1, p2, s1, s2], i) =>
        insM.run(r1, type === 'WS' ? p1.replace('J.', 'A.') : p1, p2, s1, s2)
      );
      samplePlayers.slice(4, 6).forEach(([p1, p2, s1, s2]) => insM.run(qf, p1, p2, s1, s2));
    }
  });

  console.log('[db] seeded circuits, demo tournaments, demo user (demo / 0000), league TENNIS');
}

seed();

module.exports = db;
