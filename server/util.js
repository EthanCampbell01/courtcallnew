const crypto = require('crypto');

const ADMIN_KEY = process.env.ADMIN_KEY || '';

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

// 6 chars, excluding confusing characters 0 O I 1 S 5
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
function generateInviteCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

const VALID_PIN = /^\d{4}$/;
const VALID_USERNAME = /^[a-zA-Z0-9_]{2,20}$/;
const EMOJIS = ['\u{1F602}', '\u{1F525}', '\u{1F480}', '\u{1F44F}', '\u{1F921}', '\u{1F624}', '\u{1F4AA}', '\u{1F9E0}'];

// ---- middleware (lazy db require avoids circular import) ----
function getDb() {
  return require('./db');
}

function attachUser(req, _res, next) {
  req.user = null;
  req.isAdminKey = ADMIN_KEY && req.headers['x-admin-key'] === ADMIN_KEY;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    const row = getDb()
      .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
      .get(token);
    if (row) req.user = row;
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' });
  next();
}

function requireAdmin(req, res, next) {
  if (req.isAdminKey || (req.user && req.user.is_admin)) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

module.exports = {
  hashPin,
  newToken,
  generateInviteCode,
  VALID_PIN,
  VALID_USERNAME,
  EMOJIS,
  attachUser,
  requireUser,
  requireAdmin,
};
