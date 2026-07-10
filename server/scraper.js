// Optional auto-scraper daemon for ti.tournamentsoftware.com.
// Enabled with ENABLE_SCRAPER=true. Requires Chromium (provided in the Docker image).
// discover.js finds Ulster/Leinster/Munster TI tournaments and their draw pages on
// its own schedule; this file syncs match data for every row it adds to scrape_sources.
const db = require('./db');
const { runDiscoveryCycle } = require('./discover');

const INTERVAL_MS = Number(process.env.SCRAPE_INTERVAL_MS || 30 * 60 * 1000);
const DISCOVERY_INTERVAL_MS = Number(process.env.DISCOVERY_INTERVAL_MS || 6 * 60 * 60 * 1000);

// Event type from a draw name. TI names draws either by abbreviation
// ("MS 500 35", "XD 1 Championship") or in words ("Ladies Doubles Handicap").
function typeFromName(name) {
  const raw = (name || '').trim();
  if (!raw) return null;
  const abbr = raw.match(/^(MS|WS|MD|WD|XD)\b/i);
  if (abbr) return abbr[1].toUpperCase();
  const n = raw.toLowerCase();
  if (/mixed/.test(n)) return 'XD';
  if (/\b(ladies|women|womens|girls)\b/.test(n)) return /doubles/.test(n) ? 'WD' : 'WS';
  if (/doubles/.test(n)) return 'MD';
  if (/singles/.test(n)) return 'MS';
  return null;
}

// Parse a ti.tournamentsoftware bracket draw page (runs in the page via evaluate).
// Each .match has two .match__row (the two sides); a side's player name(s) live in
// .match__row-title-value (doubles → "A / B"). Rounds come from the bracket columns
// (last column = Final), and swiper duplicates the visible slides so we exclude
// clones and dedupe. The draw's name gives the event type (MS/WS/MD/WD/XD).
function EXTRACTOR() {
  const clean = (s) => (s || '').replace(/ /g, ' ').replace(/\s*\[\d+\]\s*/g, '').replace(/\s+/g, ' ').trim();
  const sideNames = (row) => [...row.querySelectorAll('.match__row-title-value')].map((e) => clean(e.textContent)).filter(Boolean);
  let cols = [...document.querySelectorAll('.bracket-round__item')].filter((c) => !c.classList.contains('swiper-slide-duplicate'));
  if (!cols.length) cols = [document];
  const roundFromEnd = (n) => ['Final', 'Semi-Final', 'Quarter-Final', 'Round of 16', 'Round of 32', 'Round of 64'][n] || ('Round ' + (cols.length - n));
  const seen = new Set();
  const rows = [];
  cols.forEach((col, ci) => {
    const round = roundFromEnd(cols.length - 1 - ci);
    col.querySelectorAll('.match').forEach((match) => {
      const mr = [...match.querySelectorAll('.match__row')];
      if (mr.length < 2) return;
      let player1 = sideNames(mr[0]).join(' / ');
      let player2 = sideNames(mr[1]).join(' / ');
      // skip to-be-decided ("X Or Y") and incomplete entries (a pair whose partner
      // is still an unnamed "Player 2" placeholder) — they resync once set
      if (/ or /i.test(player1) || / or /i.test(player2)
        || /\bplayer\s*\d+\b/i.test(player1) || /\bplayer\s*\d+\b/i.test(player2)) return;
      // A bye is a slot where one side is empty/"Bye" and the other is a real player;
      // KEEP these (player = "Bye") so the bracket has a full tree. Skip a slot that
      // is a bye on both sides (an undetermined future match).
      const bye1 = !player1 || /^bye$/i.test(player1);
      const bye2 = !player2 || /^bye$/i.test(player2);
      if (bye1 && bye2) return;
      if (bye1) player1 = 'Bye';
      if (bye2) player2 = 'Bye';
      const key = round + '|' + player1 + '|' + player2;
      if (seen.has(key)) return;
      seen.add(key);
      const seeds = (match.textContent.match(/\[(\d+)\]/g) || []).map((s) => Number(s.replace(/\D/g, '')));
      rows.push({ round, player1, player2, seed1: seeds[0] != null ? seeds[0] : null, seed2: seeds[1] != null ? seeds[1] : null });
    });
  });
  const drawName = [...document.querySelectorAll('.nav-link__value')].map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).find((t) => /singles|doubles/i.test(t)) || '';
  const dn = drawName.toLowerCase();
  const type = /mixed/.test(dn) ? 'XD'
    : /(women|ladies|girls)/.test(dn) ? (/doubles/.test(dn) ? 'WD' : 'WS')
    : /doubles/.test(dn) ? 'MD'
    : 'MS';
  const title = (document.querySelector('h1, h2, .page-title, .media__title')?.textContent || document.title || '')
    .replace(/^\s*Draw\s*-\s*/i, '').replace(/\s*\|.*$/, '').trim();
  return { title, drawName, type, rows };
}

async function scrapeOnce(browser, source) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) CourtCallScraper/1.0');
    await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 60000 });
    // accept the cookie banner and let the bracket (a JS swiper) finish rendering
    await page.evaluate(() => { const b = [...document.querySelectorAll('button, a')].find((e) => /accept/i.test(e.textContent || '')); if (b) b.click(); }).catch(() => {});
    await page.waitForSelector('.match', { timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    const data = await page.evaluate(EXTRACTOR);

    if (!data.rows.length) {
      console.log(`[scraper] no matches found at ${source.url}`);
      return;
    }

    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(source.tournament_id);
    if (!tournament) return;

    // group rows by round (keeps bracket order: R16 → QF → SF → Final)
    const byRound = {};
    for (const r of data.rows) (byRound[r.round] ||= []).push(r);

    // prefer the draw name captured at discovery (reliable) over page extraction
    const drawName = source.draw_name || data.drawName || '';
    const events = [{
      type: typeFromName(drawName) || data.type || 'MS',
      name: drawName || data.title,
      rounds: Object.entries(byRound).map(([name, matches]) => ({ name, matches })),
    }];

    // reuse the admin /import endpoint so dedupe behaviour matches the extension
    try {
      const resp = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/admin/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY || '' },
        body: JSON.stringify({
          circuit_id: tournament.circuit_id,
          // Match the tournament by its OWN source_url (set by discover.js to the
          // tournament page URL) — NOT source.url, which is this individual draw
          // page and would make /import create a duplicate empty tournament.
          tournament: { name: tournament.name, source_url: tournament.source_url || source.url },
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
    puppeteer = require('puppeteer');
  } catch {
    console.error('[scraper] puppeteer is not installed; skipping cycle');
    return;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
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

module.exports = { start, runCycle, runDiscoveryCycle };
