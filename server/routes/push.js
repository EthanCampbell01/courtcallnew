const router = require('express').Router();
const db = require('../db');
const { requireUser } = require('../util');

// Web push is optional: only active when VAPID keys are configured.
const PUB = process.env.VAPID_PUBLIC;
const PRIV = process.env.VAPID_PRIVATE;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@courtcall.app';
let webpush = null;
try {
  if (PUB && PRIV) {
    webpush = require('web-push');
    webpush.setVapidDetails(SUBJECT, PUB, PRIV);
  }
} catch (e) {
  console.error('[push] web-push unavailable:', e.message);
  webpush = null;
}

// Fire a push to every device a user has registered. Fire-and-forget; expired
// subscriptions (404/410) are pruned.
function sendPush(userId, { title, body, url }) {
  if (!webpush || !userId) return;
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  if (!subs.length) return;
  const payload = JSON.stringify({ title, body, url });
  const del = db.prepare('DELETE FROM push_subscriptions WHERE id = ?');
  for (const s of subs) {
    webpush
      .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      .catch((err) => { if (err.statusCode === 404 || err.statusCode === 410) del.run(s.id); });
  }
}

router.get('/push/key', (_req, res) => res.json({ key: PUB || null }));

router.post('/push/subscribe', requireUser, (req, res) => {
  const s = req.body || {};
  if (!s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(req.user.id, s.endpoint, s.keys.p256dh, s.keys.auth);
  res.json({ ok: true });
});

router.post('/push/unsubscribe', requireUser, (req, res) => {
  const ep = (req.body || {}).endpoint;
  if (ep) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(ep);
  res.json({ ok: true });
});

module.exports = router;
module.exports.sendPush = sendPush;
module.exports.pushEnabled = !!webpush;
