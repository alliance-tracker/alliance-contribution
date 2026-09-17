# Alliance Tracker

Participation tracker for a video-game alliance. Members take part in recurring in-game activities;
this app turns the ranking screenshots from those activities into a per-member **Participation Score**
plus the temporal views built on top of it — weekly rankings, overall rankings, attendance, and trends.

It replaces the spreadsheet most alliances end up maintaining by hand.

## What it does

- **Tracks three activity types out of the box** — Bear Trap, Contribution, Alliance Mobilization.
  Activity types are rows in the database, not constants, so you can add your own in-app.
- **Scores participation from config, not code.** Bear Trap is a flat point per appearance;
  Contribution and Mobilization are tiered on the raw value, with Mobilization weighted ×2.
  Tiers and weights are editable at runtime through the Scoring admin page.
- **Ingests events and rosters from screenshots, two ways.** Pick the ranking screenshots in the Add
  Event or Import Roster dialog and the Worker reads them with Workers AI on your own Cloudflare account
  (gemma-4 by default, roughly 2 seconds and 5 neurons a screenshot, inside the free daily allowance —
  a meter shows what's left). Or keep the paste path: copy the prompt the dialog gives you into any LLM
  chat with your screenshots and paste the tab-separated rows back. Both land in the same text box and go
  through the same review (see [Events](docs/guides/events.md)). Ingest is idempotent — re-pasting the
  same event updates rather than duplicates. Screenshots are never stored.
- **Resolves names through an alias table only, never fuzzy matching.** Alliances run deliberate decoy
  renames where near-identical names are different people, so an unrecognised name is never guessed —
  it lands in an unmapped queue for you to map.
- **Recomputes deterministically.** Any change to scoring config, aliases, or the roster re-resolves
  and re-scores all history from the current configuration. No effective-dating.
- **Three access tiers** — admin, manager, viewer (read-only) — so you can hand out a viewer key
  without exposing writes or the alias map.
- **Six UI languages** — English, Spanish, French, German, Korean, Arabic (right-to-left). Picked from a globe button in the
  top bar (or on the key prompt), remembered per browser. Operator-entered data (names, activity
  names, unit labels) is shown as typed; server error messages stay English.

Pages: Overview, Ranking (weekly + overall), Attendance, Members with per-member profiles, and an
admin section covering Events, Roster, Aliases, Scoring, Rewards, and Backup.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Cloudflare Workers |
| API | Hono (TypeScript) |
| Database | Cloudflare D1 (SQLite) — sole datastore, no cache layer |
| Frontend | React SPA, Vite, Tailwind + shadcn/ui |
| Tests | Vitest, with `@cloudflare/vitest-pool-workers` for integration tests against a local D1 |
| Tooling | Wrangler, Node 22 |

Single repo, single Worker: it serves `/api/*` and the built SPA from `dist/`. Backend layering is
`routes → services → repositories → D1`, with pure logic in `src/domain/` and types shared across the
Worker/SPA boundary in `shared/`.

## Requirements

- Node 22 or newer (`engines` in `package.json`; CI runs 22)
- A Cloudflare account — free tier is enough
- Wrangler is installed as a dev dependency; no global install needed

## Install

```bash
git clone <your-fork-url> alliance-tracker
cd alliance-tracker

npm install                  # Worker / backend
npm --prefix web install     # SPA — separate dependency tree, not a workspace
```

Then create your config. Both config files are gitignored because they name *your* Worker, *your*
database, and *your* keys — copy the committed templates:

```bash
cp wrangler.toml.example wrangler.toml
cp .dev.vars.example .dev.vars

npx wrangler d1 create alliance-tracker-db   # prints the database name and id
```

Paste the printed `database_name` and `database_id` into `wrangler.toml`, set your keys in
`.dev.vars` (see [Configuration](#configuration)), then set up the local database:

```bash
npm run db:migrate:local
npm run seed:local           # default scoring config only — no roster, aliases, or events
```

## Run locally

```bash
npm run dev:all
```

That starts both servers. **Open http://localhost:5173** — the Vite dev server, which proxies `/api`
to the Worker on :8787. Hitting :8787 directly gives you the API without the SPA.

Individually: `npm run dev` (Worker only), `npm run dev:web` (SPA only).

The Workers AI binding is remote-only, so the Worker needs `npx wrangler login` once before screenshot
reading works locally (everything else runs offline). Local reads spend from the same free daily
allowance as production.

The roster, aliases, and event history are all entered in the app — there is no seed path for them.
Start at the admin Roster page, import your members, then add events.

## Test

```bash
npm test        # unit + integration, in one run
npx tsc --noEmit
```

Integration tests spin up a local D1 with the migrations and seed SQL declared in
`vitest.integration.config.ts`; they do not read `wrangler.toml` and need no Cloudflare credentials.
Nothing in the test suite calls Workers AI — the screenshot reader is tested against a fake model, and
the route tests stop at validation and the daily-limit check.

## Deploy

Set your production secrets once (these are separate from `.dev.vars`, which is local-only). Use long
random values — e.g. `openssl rand -base64 32` — since `GET /api/auth/me` tells any caller which tier a
key resolves to:

```bash
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put API_KEY
npx wrangler secret put VIEWER_API_KEY
```

Screenshot reading needs no secret: the `[ai]` binding in `wrangler.toml` uses your account's Workers
AI, which has a free daily allowance (10,000 neurons, ~2,000 reads) on both the Free and Paid plans. On
the Free plan reads simply fail past the allowance; nothing can bill.

Migrate and seed the remote database, then deploy:

```bash
npm run db:migrate:remote
npm run seed:remote
npm run deploy               # builds the SPA into dist/, then wrangler deploy
```

Your app lands at `https://<worker-name>.<your-subdomain>.workers.dev`, where `<worker-name>` is the
`name` field in your `wrangler.toml`.

On later deploys, `npm run deploy` is enough; run `db:migrate:remote` again only when you have pulled
new migrations.

## Configuration

### `wrangler.toml` (from `wrangler.toml.example`)

| Setting | Notes |
| --- | --- |
| `name` | Your Worker's name — becomes the hostname |
| `[[d1_databases]]` `database_name`, `database_id` | From `wrangler d1 create`. The only place in the repo a database is named — migrations and the seed address D1 through the `DB` binding |
| `[[ratelimits]]` `API_RATE_LIMIT` | 120 requests / 60s per client IP, applied in front of auth. Required in production; skipped locally, where there is no `CF-Connecting-IP` header. Rate limiting lives in the Worker rather than the WAF because WAF rules are zone-level and do not apply to `workers.dev` |
| `[ai]` `AI` | Workers AI, used to read ranking and roster screenshots. `remote = true` so `wrangler dev` reaches the real model (needs `wrangler login`). Free tier; no key |
| `[assets]` | Serves the built SPA from `dist/`, with SPA fallback routing |
| `[vars]` `AI_*` (optional) | Tuning for the screenshot reader, each with a code default: `AI_MODEL` (`@cf/google/gemma-4-26b-a4b-it`), `AI_DAILY_NEURON_LIMIT` (10000), `AI_NEURONS_PER_READ` (5), `AI_RESERVE_NEURONS` (50), `AI_DAILY_REQUEST_CAP` (400), `AI_MAX_TOKENS` (2500), `AI_THINKING` (false). Set any of them to override; blank or invalid values fall back. The example file has the block commented with explanations. Locally they can go in `.dev.vars` |

### Secrets

| Variable | Tier | Grants |
| --- | --- | --- |
| `ADMIN_API_KEY` | admin | Everything, including destructive routes and DB export/import |
| `API_KEY` | manager | Reads and writes; not admin-only routes |
| `VIEWER_API_KEY` | viewer | Reads only — any non-GET or any `/api/admin/*` request is 403 |

Sent by the client as an `X-Api-Key` header. Set all three: a tier whose key is unset or empty fails
closed, so that tier simply cannot authenticate. Every `/api` route requires a key except
`GET /api/health` (uptime probe) and `GET /api/auth/me` (lets the SPA discover which tier its key
resolves to).

Rotating a key is `wrangler secret put <NAME>` — no redeploy needed — but every client then has to
re-enter it. Keys are stored in the browser's `localStorage` with no expiry. The SPA shell itself is
public; it holds no data, and the key gate renders before any fetch resolves.

## Documentation

User guides, one per section of the app, live in [`docs/guides/`](docs/guides/):

- [Overview](docs/guides/overview.md) — how the pieces fit together, the dashboard
- [Ranking](docs/guides/ranking.md) · [Attendance](docs/guides/attendance.md) · [Members](docs/guides/members.md)
- Admin: [Events](docs/guides/events.md) (screenshots read in-app, or LLM → paste) · [Roster](docs/guides/roster.md) ·
  [Aliases](docs/guides/aliases.md) · [Scoring](docs/guides/scoring.md) · [Rewards](docs/guides/rewards.md) ·
  [Backup](docs/guides/backup.md) · [Schedule](docs/guides/schedule.md) (Discord reminders, opt-in)

`CLAUDE.md` holds conventions and non-obvious decisions for humans and coding agents. The rest of `docs/`
(`data/`, `fixtures/`, `plans/`, `specs/`) is gitignored — one deployment's real roster and alias data plus
design notes — and is not needed to build or run the app.

## License

MIT — see [LICENSE.md](LICENSE.md).
