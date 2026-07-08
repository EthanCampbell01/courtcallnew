const express = require('express');
const path = require('path');
const fs = require('fs');
const { attachUser } = require('./util');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '20mb' })); // large enough for AI draw-import screenshots
app.use(attachUser);

// CORS for the Chrome extension's admin imports (everything else is same-origin)
app.use('/api', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'courtcall', sport: process.env.APP_SPORT || 'multi' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/circuits'));
app.use('/api', require('./routes/predictions'));
app.use('/api', require('./routes/futures'));
app.use('/api', require('./routes/notifications'));
app.use('/api', require('./routes/push'));
app.use('/api', require('./routes/leagues'));
app.use('/api', require('./routes/social'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin', require('./routes/vision'));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// error handler — never leak stack traces
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

// Serve the built React app in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => console.log(`CourtCall API listening on :${PORT}`));

if (process.env.ENABLE_SCRAPER === 'true' || process.env.ENABLE_SCRAPER === '1') {
  require('./scraper').start();
}

// deadline reminders — sweep every 15 min (and shortly after boot)
const { deadlineSweep } = require('./routes/notifications');
setTimeout(deadlineSweep, 20000);
setInterval(deadlineSweep, 15 * 60 * 1000);
