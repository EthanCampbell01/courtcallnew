// Optional auto-scraper daemon for ti.tournamentsoftware.com.
// Enabled with ENABLE_SCRAPER=true. Requires Chromium (provided in the Docker image).
// discover.js finds Ulster/Leinster/Munster TI tournaments and their draw pages on
// its own schedule; this file syncs match data for every row it adds to scrape_sources.
const db = require('./db');
const { runDiscoveryCycle } = require('./discover');

const INTERVAL_MS = Number(process.env.SCRAPE_INTERVAL_MS || 30 * 60 * 1000);
const DISCOVERY_INTERVAL_MS = Number(process.env.DISCOVERY_INTERVAL_MS || 6 * 60 * 60 * 1000);
const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

// Same parsing logic as the Chrome extension content script, run inside the page.
const EXTRACTOR = `(() => {
  const rows = [];
  document.querySelectorAll('.match-group__item, .match, table.matches tr').forEach((el) => {
    const players = [...el.querySelectorAll('.match__row-title-value, .nav-link__value, td.player a')]
      .map((a) => a.textContent.trim()).filter(Boolean);
    if (players.length < 2) return;
    const seedText = el.textContent.match(/\\[(\\d+)\\]/g) || [];
    rows.push({
      player1: players[0].replace(/\\s*\\[\\d+\\]\\s*/g, ''),
      player2: players[1].replace(/\\s*\\[\\d+\\]\\s*/g, ''),
      seed1: seedText[0] ? Number(seedText[0].replace(/\\D/g, '')) : null,
      seed2: seedText[1] ? Number(seedText[1].replace(/\\D/g, '')) : null,
      round: (el.closest('[data-round-name]')?.dataset.roundName) ||
             (el.closest('.match-group')?.querySelector('h3,h2,.match-group__header')?.textContent.trim()) || 'Round 1',
    });
  });
  const title = document.querySelector('h1, .page-title, .media__title')?.textContent.trim() || document.title;
  return { title, rows };
})()`;

async function scrapeOnce(browser, source) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) CourtCallScraper/1.0');
    await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 60000 });
    const data = await page.evaluate(EXTRACTOR);

    if (!data.rows.length) {
      console.log(`[scraper] no matches found at ${source.url}`);
      return;
    }

    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(source.tournament_id);
    if (!tournament) return;

    // group rows by round name, infer event type from URL/draw title
    const typeGuess = /\bWS\b|women/i.test(source.url + data.title) ? 'WS'
      : /\bMD\b/i.test(data.title) ? 'MD' : /\bWD\b/i.test(data.title) ? 'WD'
      : /\bXD\b|mixed/i.test(data.title) ? 'XD' : 'MS';

    const byRound = {};
    for (const r of data.rows) (byRound[r.round] ||= []).push(r);

    const events = [{
      type: typeGuess,
      name: data.title,
      rounds: Object.entries(byRound).map(([name, matches]) => ({ name, matches })),
    }];

    // reuse the admin /import endpoint so dedupe behaviour matches the extension
    try {
      const resp = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/admin/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY || '' },
        body: JSON.stringify({
          circuit_id: tournament.circuit_id,
          tournament: { name: tournament.name, source_url: source.url },
          events,
        }),
      });
      console.log('[scraper] import:', JSON.stringify(await resp.json()));
    } catch (e) {
      console.error('[scraper] import failed:', e.message);
    }

    db.prepare("UPDATE scrape_sources SET last_run = datetime('now') WHERE id = ?").run(source.id);
  } catch (e) {
    console.error(`[scraper] ${source.url}: ${e.message}`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function runCycle() {
  const sources = db.prepare('SELECT * FROM scrape_sources WHERE enabled = 1').all();
  if (!sources.length) return;

  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch {
    console.error('[scraper] puppeteer-core is not installed; skipping cycle');
    return;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 60000,
    });
    for (const source of sources) await scrapeOnce(browser, source);
  } catch (e) {
    console.error('[scraper] launch failed:', e.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function start() {
  if (!process.env.ADMIN_KEY) {
    console.warn('[scraper] ADMIN_KEY is not set — imports will be rejected. Set ADMIN_KEY to enable.');
  }
  console.log(`[scraper] discovery every ${Math.round(DISCOVERY_INTERVAL_MS / 3600000)}h, draw sync every ${Math.round(INTERVAL_MS / 60000)}min`);
  setTimeout(runDiscoveryCycle, 20000);
  setInterval(runDiscoveryCycle, DISCOVERY_INTERVAL_MS);
  setTimeout(runCycle, 15000);
  setInterval(runCycle, INTERVAL_MS);
}

module.exports = { start };
