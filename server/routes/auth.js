const router = require('express').Router();
const db = require('../db');
const { hashPin, newToken, VALID_PIN, VALID_USERNAME, requireUser } = require('../util');

router.post('/register', (req, res) => {
  const { username, pin } = req.body || {};
  if (!VALID_USERNAME.test(username || '')) {
    return res.status(400).json({ error: 'Username must be 2-20 letters, numbers or underscores' });
  }
  if (!VALID_PIN.test(pin || '')) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'That username is taken' });

  // First registered user becomes admin
  const isFirst = db.prepare('SELECT COUNT(*) c FROM users WHERE username != ?').get('demo').c === 0;
  const info = db
    .prepare('INSERT INTO users (username, pin_hash, is_admin) VALUES (?,?,?)')
    .run(username, hashPin(pin), isFirst ? 1 : 0);

  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?,?)').run(token, info.lastInsertRowid);
  const user = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token, user, circuits: [] });
});

router.post('/login', (req, res) => {
  const { username, pin } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '');
  if (!user || user.pin_hash !== hashPin(pin || '')) {
    return res.status(401).json({ error: 'Wrong username or PIN' });
  }
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?,?)').run(token, user.id);
  res.json({
    token,
    user: { id: user.id, username: user.username, is_admin: user.is_admin },
    circuits: memberCircuits(user.id),
  });
});

router.post('/logout', requireUser, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

router.get('/me', requireUser, (req, res) => {
  res.json({
    user: { id: req.user.id, username: req.user.username, is_admin: req.user.is_admin },
    circuits: memberCircuits(req.user.id),
  });
});

function memberCircuits(userId) {
  return db
    .prepare(
      `SELECT c.* FROM circuits c JOIN user_circuits uc ON uc.circuit_id = c.id WHERE uc.user_id = ? ORDER BY c.name`
    )
    .all(userId);
}

module.exports = router;
