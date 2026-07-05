const $ = (id) => document.getElementById(id);
const status = (msg, cls = '') => { const el = $('status'); el.textContent = msg; el.className = cls; };

let scraped = null; // { title, rows, url }

const cleanBase = (u) => u.trim().replace(/\/+$/, '');

async function loadSettings() {
  const { api = '', key = '', circuit = '' } = await chrome.storage.local.get(['api', 'key', 'circuit']);
  $('api').value = api;
  $('key').value = key;
  if (api && key) await loadCircuits(circuit);
}

async function loadCircuits(selected = '') {
  const base = cleanBase($('api').value);
  if (!base) return;
  try {
    // /api/circuits requires auth; the admin overview lists circuits with just the admin key
    const r = await fetch(`${base}/api/admin/overview`, { headers: { 'x-admin-key': $('key').value } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    const d = await r.json();
    $('circuit').innerHTML = d.circuits
      .map((c) => `<option value="${c.id}" ${String(c.id) === String(selected) ? 'selected' : ''}>${c.name}</option>`)
      .join('');
    status(`Connected — ${d.circuits.length} circuits, ${d.counts.matches_pending} matches awaiting results.`, 'ok');
  } catch (e) {
    $('circuit').innerHTML = '<option value="">Could not load circuits</option>';
    status(`Connection failed: ${e.message}`, 'err');
  }
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ api: cleanBase($('api').value), key: $('key').value });
  await loadCircuits($('circuit').value);
});

$('circuit').addEventListener('change', () => chrome.storage.local.set({ circuit: $('circuit').value }));

$('scrape').addEventListener('click', async () => {
  status('Scraping…');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('tournamentsoftware.com')) {
    return status('Open a draw page on ti.tournamentsoftware.com first.', 'err');
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
    scraped = result;
    if (!scraped?.rows?.length) return status('No matches found on this page — open a specific draw.', 'err');

    const rounds = [...new Set(scraped.rows.map((r) => r.round))];
    $('preview').hidden = false;
    $('preview').innerHTML =
      `<b>${scraped.title}</b><br>${scraped.rows.length} matches across ${rounds.length} round(s):<br>` +
      rounds.map((rn) => `· ${rn} (${scraped.rows.filter((r) => r.round === rn).length})`).join('<br>');
    $('import').hidden = false;
    status('Looks good? Import below.');
  } catch (e) {
    status(`Scrape failed: ${e.message}`, 'err');
  }
});

$('import').addEventListener('click', async () => {
  const base = cleanBase($('api').value);
  const key = $('key').value;
  const circuitId = Number($('circuit').value);
  if (!base || !key) return status('Set the server URL and admin key first.', 'err');
  if (!circuitId) return status('Pick a circuit.', 'err');
  if (!scraped) return status('Scrape a page first.', 'err');

  const byRound = {};
  for (const r of scraped.rows) (byRound[r.round] ||= []).push(r);

  const payload = {
    circuit_id: circuitId,
    tournament: { name: scraped.title, source_url: scraped.url },
    events: [{
      type: $('etype').value,
      name: scraped.title,
      rounds: Object.entries(byRound).map(([name, matches]) => ({
        name,
        matches: matches.map(({ player1, player2, seed1, seed2 }) => ({ player1, player2, seed1, seed2 })),
      })),
    }],
  };

  status('Importing…');
  try {
    const r = await fetch(`${base}/api/admin/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    status(`Imported ✓  events +${d.events}, rounds +${d.rounds}, matches +${d.matches}` +
      (d.skipped ? ` (${d.skipped} already existed)` : '') +
      '\nSet round deadlines in the CourtCall admin panel.', 'ok');
  } catch (e) {
    status(`Import failed: ${e.message}`, 'err');
  }
});

loadSettings();
