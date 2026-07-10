// Auto-discovers Ulster/Leinster/Munster Tennis Ireland tournaments from the
// public ti.tournamentsoftware.com listing and registers them (plus their draw
// pages) so scraper.js's existing scrapeOnce() cycle can pull match data
// without anyone manually pasting a tournament URL in.
const db = require('./db');

// Scan in-progress (1), upcoming (2) and recently-updated (3) so a draw is picked
// up whether it's published before, during or after play starts.
const LISTING_STATUS_IDS = [1, 2, 3];
const PAGE_DELAY_MS = 2000;

const FEDERATION_CIRCUITS = {
  Ulster: 'ulster-ti',
  Leinster: 'leinster-ti',
  Munster: 'munster-ti',
};

// Many opens are listed under the CLUB (e.g. "Ballycastle Tennis Club | Ballycastle,
// Northern Ireland"), not "Tennis Ulster". Fall back to inferring the province from
// the location so club-run tournaments are still discovered.
const PROVINCE_COUNTIES = {
  Ulster: ['northern ireland', 'antrim', 'armagh', 'derry', 'londonderry', 'down', 'fermanagh', 'tyrone', 'donegal', 'cavan', 'monaghan'],
  Leinster: ['dublin', 'wicklow', 'wexford', 'carlow', 'kildare', 'kilkenny', 'laois', 'longford', 'louth', 'meath', 'offaly', 'westmeath'],
  Munster: ['cork', 'clare', 'kerry', 'limerick', 'tipperary', 'waterford'],
};
function provinceFromText(text) {
  const s = text || '';
  for (const [prov, counties] of Object.entries(PROVINCE_COUNTIES)) {
    if (counties.some((c) => new RegExp('\\b' + c.replace(/ /g, '\\s+') + '\\b', 'i').test(s))) return prov;
  }
  return null;
}

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
  const byUrl = new Map();
  try {
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) CourtCallScraper/1.0');
    for (const sid of LISTING_STATUS_IDS) {
      // list=1&page=3 loads ~60 results (the listing is cumulative) so tournaments
      // further out — like an August open while it's still July — aren't missed.
      await page.goto(`https://ti.tournamentsoftware.com/find?StatusFilterID=${sid}&list=1&page=3`, { waitUntil: 'networkidle2', timeout: 60000 });
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

      for (const c of cards) {
        if (byUrl.has(c.url)) continue;
        const fedLine = c.subheadings.find((s) => /^Tennis (Ulster|Leinster|Munster)\b/.test(s));
        // federation-organised → read the province directly; else infer from location
        let federation = fedLine ? fedLine.match(/^Tennis (\w+)/)[1] : null;
        if (!federation) {
          for (const s of c.subheadings) { const prov = provinceFromText(s); if (prov) { federation = prov; break; } }
        }
        if (!federation) continue;
        const venue = (fedLine ? fedLine.split('|')[1]?.trim() : c.subheadings[0]?.split('|')[0]?.trim()) || '';
        const dateLine = c.subheadings.find((s) => /\d{2}\/\d{2}\/\d{4}/.test(s));
        const dateMatch = dateLine && dateLine.match(/(\d{2}\/\d{2}\/\d{4})\s*to\s*(\d{2}\/\d{2}\/\d{4})/);
        byUrl.set(c.url, {
          name: c.name,
          url: c.url,
          federation,
          venue,
          start_date: dateMatch ? parseUkDate(dateMatch[1]) : null,
          end_date: dateMatch ? parseUkDate(dateMatch[2]) : null,
        });
      }
    }
    return [...byUrl.values()];
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
      const seen = new Set(); const out = [];
      document.querySelectorAll('a[href*="draw"]').forEach((a) => {
        const name = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/singles|doubles|mixed|\bms\b|\bws\b|\bmd\b|\bwd\b|\bxd\b/i.test(name)) return;
        if (seen.has(a.href)) return;
        seen.add(a.href);
        out.push({ url: a.href, name });
      });
      return out;
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

    // Draws publish close to the event, so only *poll draws* for imminent
    // tournaments — everything else is just registered now and revisited as it
    // nears. This keeps each cycle fast even with a big calendar.
    const imminent = (t) => (!t.start_date || t.start_date <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
      && (!t.end_date || t.end_date >= new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10));

    const addDrawSources = async (tournamentId, tournamentPageUrl) => {
      const existingUrls = new Set(
        db.prepare('SELECT url FROM scrape_sources WHERE tournament_id = ?').all(tournamentId).map((s) => s.url)
      );
      await delay(PAGE_DELAY_MS);
      const drawLinks = await findDrawLinks(browser, tournamentPageUrl);
      for (const { url, name } of drawLinks) {
        if (existingUrls.has(url)) continue;
        try {
          db.prepare('INSERT INTO scrape_sources (url, tournament_id, enabled, draw_name) VALUES (?,?,1,?)').run(url, tournamentId, name || null);
          console.log(`[discover]   + draw source: ${name} → ${url}`);
        } catch { /* already registered (URL is UNIQUE) */ }
      }
    };

    const processed = new Set();
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

      processed.add(tournament.id);
      if (imminent(t)) await addDrawSources(tournament.id, t.url);
    }

    // Safety net: re-poll already-known imminent tournaments that still have no
    // draw sources (draw published after they left the listing), excluding the
    // ones just handled above.
    const pending = db.prepare(
      `SELECT * FROM tournaments
       WHERE source_url IS NOT NULL
         AND (start_date IS NULL OR date(start_date) <= date('now', '+14 days'))
         AND (end_date IS NULL OR date(end_date) >= date('now', '-2 days'))
         AND NOT EXISTS (SELECT 1 FROM scrape_sources s WHERE s.tournament_id = tournaments.id)`
    ).all();
    for (const t of pending) {
      if (processed.has(t.id)) continue; // already handled in the listing loop
      await addDrawSources(t.id, t.source_url);
    }
  } catch (e) {
    console.error('[discover] cycle failed:', e.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { runDiscoveryCycle };
