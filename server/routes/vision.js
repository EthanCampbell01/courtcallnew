const router = require('express').Router();
const db = require('../db');
const { requireAdmin } = require('../util');

// AI draw importer — turn a photo/screenshot of a tournament draw into the
// structured payload the /admin/import endpoint already understands. This lets
// an organiser load a whole padel (or tennis) draw without hand-keying matches:
// upload the draw, Claude reads the pairs/rounds/scores, you review, then import.

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const API_BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const MODEL = process.env.VISION_MODEL || 'claude-sonnet-5';

const EVENT_TYPES = ['MS', 'WS', 'MD', 'WD', 'XD'];

const EXTRACT_PROMPT = `You are reading one or more images of a racket-sport tournament draw (padel or tennis).
Extract the draw as STRICT JSON only — no prose, no markdown fences. Use this exact shape:

{
  "tournament": { "name": string, "venue": string|null, "start_date": "YYYY-MM-DD"|null, "end_date": "YYYY-MM-DD"|null },
  "events": [
    {
      "type": "MS"|"WS"|"MD"|"WD"|"XD",
      "name": string,
      "rounds": [
        {
          "name": string,                        // e.g. "Round 1", "Quarter-Final", "Semi-Final", "Final"
          "matches": [
            {
              "player1": string,                 // for doubles/padel a PAIR, e.g. "Murphy / O'Brien"
              "player2": string,
              "seed1": number|null,
              "seed2": number|null,
              "score": string|null,              // e.g. "6-4 3-6 7-5"; null if not played yet
              "winner": 1|2|null                 // which side won, or null if not decided
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Padel is doubles: map categories to MD (men's), WD (women's), XD (mixed). Tennis singles use MS/WS.
- Keep player/pair names exactly as written. Use "TBD" for an undetermined slot and "Bye" for a bye.
- Order rounds from earliest to final. Only include matches you can actually read.
- If a field is unknown, use null. Output ONLY the JSON object.`;

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[a-zA-Z.+-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  return { media_type: m[1], data: m[2] };
}

// Coerce/validate the model output into a safe import payload.
function sanitize(parsed) {
  const t = parsed.tournament || {};
  const tournament = {
    name: String(t.name || '').trim() || 'Untitled tournament',
    venue: t.venue ? String(t.venue).trim() : '',
    start_date: /^\d{4}-\d{2}-\d{2}$/.test(t.start_date || '') ? t.start_date : null,
    end_date: /^\d{4}-\d{2}-\d{2}$/.test(t.end_date || '') ? t.end_date : null,
  };
  const events = (Array.isArray(parsed.events) ? parsed.events : [])
    .filter((e) => EVENT_TYPES.includes(e.type))
    .map((e) => ({
      type: e.type,
      name: String(e.name || e.type).trim(),
      rounds: (Array.isArray(e.rounds) ? e.rounds : [])
        .filter((r) => r && r.name)
        .map((r) => ({
          name: String(r.name).trim(),
          matches: (Array.isArray(r.matches) ? r.matches : [])
            .filter((m) => m && m.player1 && m.player2)
            .map((m) => ({
              player1: String(m.player1).trim(),
              player2: String(m.player2).trim(),
              seed1: Number.isInteger(m.seed1) ? m.seed1 : null,
              seed2: Number.isInteger(m.seed2) ? m.seed2 : null,
              score: m.score ? String(m.score).trim() : null,
              winner: m.winner === 1 || m.winner === 2 ? m.winner : null,
            })),
        })),
    }));
  return { tournament, events };
}

router.post('/import/vision', requireAdmin, async (req, res) => {
  if (!API_KEY) {
    return res.status(501).json({ error: 'AI import is not configured — set ANTHROPIC_API_KEY on the server to enable it.' });
  }
  const { images, hint } = req.body || {};
  const list = Array.isArray(images) ? images : (images ? [images] : []);
  if (!list.length) return res.status(400).json({ error: 'Attach at least one draw image' });
  if (list.length > 8) return res.status(400).json({ error: 'Up to 8 images per import' });

  const imageBlocks = [];
  for (const d of list) {
    const parsed = parseDataUrl(d);
    if (!parsed) return res.status(400).json({ error: 'Images must be base64 data URLs (image/png or image/jpeg)' });
    imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: parsed.media_type, data: parsed.data } });
  }

  const content = [
    ...imageBlocks,
    { type: 'text', text: EXTRACT_PROMPT + (hint ? `\n\nContext from the organiser: ${String(hint).slice(0, 400)}` : '') },
  ];

  try {
    const resp = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, messages: [{ role: 'user', content }] }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('[vision] anthropic error', resp.status, detail.slice(0, 300));
      return res.status(502).json({ error: `AI service error (${resp.status})` });
    }
    const data = await resp.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    let parsed;
    try { parsed = JSON.parse(jsonStr); } catch (e) {
      return res.status(422).json({ error: 'Could not read a draw from that image — try a clearer screenshot', raw: text.slice(0, 500) });
    }
    const draw = sanitize(parsed);
    const matchCount = draw.events.reduce((n, e) => n + e.rounds.reduce((m, r) => m + r.matches.length, 0), 0);
    if (matchCount === 0) return res.status(422).json({ error: 'No matches found in that image — try a clearer or fuller screenshot' });
    // Return for review; the client confirms and posts to /admin/import.
    res.json({ ok: true, draw, match_count: matchCount, model: MODEL });
  } catch (e) {
    console.error('[vision] failed', e.message);
    res.status(500).json({ error: 'AI import failed — please try again' });
  }
});

module.exports = router;
module.exports.sanitize = sanitize;
