# CourtCall 🎾

Fantasy predictions for Irish & UK amateur tennis. Call every match, top every league.

Players join a **circuit** (Ulster TI, Leinster TI, Munster TI, BUCS…), predict match winners,
set counts and exact scores before each round's deadline, and compete in private **leagues**
with invite codes, leaderboards, reactions and head-to-head stats.

## Stack

| Layer | Tech |
|---|---|
| API | Node.js + Express + better-sqlite3 (single-file SQLite) |
| Client | React 18 + React Router v6 + Vite, installable PWA |
| Styling | Hand-rolled CSS, dark theme (`#080B10` / accent `#00E87B`), DM Sans + JetBrains Mono |
| Import | Chrome MV3 extension + optional Puppeteer scraper for ti.tournamentsoftware.com |
| Deploy | Docker → Railway or Render |

## Quick start (local)

```bash
# 1. API (port 3001)
cd server
npm install
ADMIN_KEY=dev-secret node index.js

# 2. Client (port 5173, proxies /api → 3001)
cd client
npm install
npm run dev
```

Open http://localhost:5173.

- **Demo account**: username `demo`, PIN `0000` (already in a league — invite code `TENNIS`).
- **Admin**: the *first account you register* automatically becomes admin (the demo user doesn't count).
  Additional admins can be promoted via `POST /api/admin/users/:id/promote`.
- The seed includes 4 circuits and 4 Ulster demo tournaments with open rounds to predict.

### Production build locally

```bash
cd client && npm run build   # outputs client/dist
cd ../server && ADMIN_KEY=dev-secret node index.js
# Express now serves the built app at http://localhost:3001
```

## Scoring (max 48 per match)

| Call | Points |
|---|---|
| Correct winner | **10** |
| Correct set count (2 or 3) | **5** |
| Exact score (e.g. `6-4 3-6 7-5`) | **15** |
| Upset bonus (unseeded beats seeded, or higher seed number wins) | **8** |
| All-three bonus (winner + sets + exact) | **10** |

Walkovers and retirements award winner points only. Predictions **lock at the round deadline**
and other people's picks stay **hidden until the match completes** — both enforced server-side.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `ADMIN_KEY` | — | Secret for `x-admin-key` header (extension/scraper imports + emergency admin) |
| `DATA_DIR` | `server/data` | Where `courtcall.db` lives — point at a persistent volume in prod |
| `ENABLE_SCRAPER` | off | `true` starts the Puppeteer scraper daemon (needs Chromium, included in Docker image) |
| `SCRAPE_INTERVAL_MS` | `1800000` | Scraper cycle interval (30 min) |

## Deploy

### Railway
1. New project → Deploy from repo (Dockerfile is auto-detected; `railway.toml` included).
2. Add a **volume** mounted at `/app/server/data`.
3. Set `ADMIN_KEY`. Done — health check is `/api/health`.

### Render
`render.yaml` is included — "New → Blueprint" and point it at the repo. A 1 GB disk is
configured at `/app/server/data` and `ADMIN_KEY` is auto-generated.

## Chrome extension (draw importer)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/`.
2. Open the popup, enter your deployed server URL + `ADMIN_KEY`, hit **Save settings** — circuits load.
3. Browse to a draw on `ti.tournamentsoftware.com`, pick the circuit + event type, **Scrape this page**,
   review the preview, then **Import**. Re-imports are deduped (tournaments matched by source URL,
   matches by round + player pair).
4. Imported rounds default to a deadline 7 days out — set real deadlines in the in-app **Admin** panel.

The optional server-side scraper does the same thing on a timer: insert rows into the
`scrape_sources` table (`url`, `tournament_id`) and run with `ENABLE_SCRAPER=true`.

## API sketch

```
POST /api/auth/register | login | logout      GET /api/auth/me
GET  /api/circuits      POST /api/circuits/:id/join | leave
GET  /api/tournaments[?circuit=]              GET /api/tournaments/:id
PUT  /api/matches/:id/prediction              DELETE /api/matches/:id/prediction
GET  /api/matches/:id/predictions             POST /api/predictions/:id/react
GET  /api/predictions/mine | open
GET  /api/leagues       POST /api/leagues | /api/leagues/join | /:id/leave
GET  /api/leagues/:id   (leaderboard + activity feed)
GET  /api/stats/me      GET /api/users/search?q=    GET /api/h2h/:userId
POST /api/admin/tournaments | events | rounds | matches | matches/:id/result | import
GET  /api/admin/overview                      (admin = is_admin user or x-admin-key)
```

## Project layout

```
server/      Express API, SQLite schema + seed, scoring engine, optional scraper
client/      React PWA (Vite)
extension/   Chrome MV3 draw importer
Dockerfile   Multi-stage build (client → slim runtime + Chromium)
```
