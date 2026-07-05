// Auto-discovers Ulster/Leinster/Munster Tennis Ireland tournaments from the
// public ti.tournamentsoftware.com listing and registers them (plus their draw
// pages) so scraper.js's existing scrapeOnce() cycle can pull match data
// without anyone manually pasting a tournament URL in.
const db = require('./db');

const LISTING_URL = 'https://ti.tournamentsoftware.com/find?StatusFilterID=2';
const PAGE_DELAY_MS = 2000;

const FEDERATION_CIRCUITS = {
  Ulster: 'ulster-ti',
  Leinster: 'leinster-ti',
  Munster: 'munster-ti',
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function acceptCookies(page) {
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, a')].find((el) => /accept/i.test(el.textContent || ''));
    if (btn) btn.click();
  });
}

function parseUkDate(s) {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function findTournaments(browser) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) CourtCallScraper/1.0');
    await page.goto(LISTING_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await acceptCookies(page);
    await delay(PAGE_DELAY_MS);

    const cards = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.media').forEach((el) => {
        const link = el.querySelector('a.media__link');
        if (!link) return;
        const subheadings = [...el.querySelectorAll('.media__subheading')]
          .map((s) => s.textContent.replace(/\s+/g, ' ').trim());
        out.push({ name: link.getAttribute('title') || link.textContent.trim(), url: link.href, subheadings });
      });
      return out;
    });

    const found = [];
    for (const c of cards) {
      const fedLine = c.subheadings.find((s) => /^Tennis (Ulster|Leinster|Munster)\b/.test(s));
      if (!fedLine) continue;
      const federation = fedLine.match(/^Tennis (\w+)/)[1];
      const venue = fedLine.split('|')[1]?.trim() || '';
      const dateLine = c.subheadings.find((s) => /\d{2}\/\d{2}\/\d{4}/.test(s));
      const dateMatch = dateLine && dateLine.match(/(\d{2}\/\d{2}\/\d{4})\s*to\s*(\d{2}\/\d{2}\/\d{4})/);
      found.push({
        name: c.name,
        url: c.url,
        federation,
        venue,
        start_date: dateMatch ? parseUkDate(dateMatch[1]) : null,
        end_date: dateMatch ? parseUkDate(dateMatch[2]) : null,
      });
    }
    return found;
  } finally {
    await page.close().catch(() => {});
  }
}

async function findDrawLinks(browser, tournamentUrl) {
  const guid = tournamentUrl.match(/id=([0-9a-f-]{36})/i);
  if (!guid) return [];
  const page = await browser.newPage();
  try {
    await page.goto(`https://ti.tournamentsoftware.com/sport/draws.aspx?id=${guid[1]}`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await acceptCookies(page);
    await delay(1500);
    return await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="draw"]')]
        .filter((a) => /singles|doubles|mixed|\bms\b|\bws\b|\bmd\b|\bwd\b|\bxd\b/i.test(a.textContent))
        .map((a) => a.href);
      return [...new Set(links)];
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function runDiscoveryCycle() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.error('[discover] puppeteer is not installed; skipping cycle');
    return;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 60000,
    });

    const tournaments = await findTournaments(browser);
    console.log(`[discover] found ${tournaments.length} Ulster/Leinster/Munster tournaments on TI`);

    for (const t of tournaments) {
      const slug = FEDERATION_CIRCUITS[t.federation];
      if (!slug) continue;
      const circuit = db.prepare('SELECT id FROM circuits WHERE slug = ?').get(slug);
      if (!circuit) continue;

      let tournament = db.prepare('SELECT * FROM tournaments WHERE source_url = ?').get(t.url);
      if (!tournament) {
        const info = db
          .prepare(
            'INSERT INTO tournaments (circuit_id, name, venue, start_date, end_date, status, source_url) VALUES (?,?,?,?,?,?,?)'
          )
          .run(circuit.id, t.name, t.venue, t.start_date, t.end_date, 'upcoming', t.url);
        tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(info.lastInsertRowid);
        console.log(`[discover] new tournament: ${t.name} (${t.federation})`);
      }

      const existingUrls = new Set(
        db.prepare('SELECT url FROM scrape_sources WHERE tournament_id = ?').all(tournament.id).map((s) => s.url)
      );

      await delay(PAGE_DELAY_MS);
      const drawLinks = await findDrawLinks(browser, t.url);
      for (const url of drawLinks) {
        if (existingUrls.has(url)) continue;
        try {
          db.prepare('INSERT INTO scrape_sources (url, tournament_id, enabled) VALUES (?,?,1)').run(url, tournament.id);
          console.log(`[discover]   + draw source: ${url}`);
        } catch {
          // already registered (URL is UNIQUE), ignore
        }
      }
    }
  } catch (e) {
    console.error('[discover] cycle failed:', e.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { runDiscoveryCycle };
