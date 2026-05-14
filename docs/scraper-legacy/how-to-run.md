# How to Run

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| PostgreSQL | ≥ 14 (or Supabase) |
| npm | ≥ 10 |

---

## 1. Install dependencies

```bash
npm install
npx playwright install chromium --with-deps
```

---

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/queer_guide
SCRAPER_USER_AGENT="QueerGuideBot/1.0 (contact: ops@yourdomain.tld)"
```

The remaining variables have sensible defaults.

---

## 3. Create the database

```bash
# Create the database (one-time)
createdb queer_guide

# Apply schema migrations
npm run migrate
```

With Supabase, set `DATABASE_URL` to your project's connection string and run `npm run migrate`.

---

## 4. Run a scrape

### Single source

```bash
npm run scrape -- --source=wikipedia
npm run scrape -- --source=iglta
npm run scrape -- --source=travelgay --type=venue
```

### All sources

```bash
npm run scrape -- --source=all
```

### Events only (hourly refresh pattern)

```bash
npm run scrape -- --source=all --type=event
```

### Limit pages (useful for testing)

```bash
npm run scrape -- --source=travelgay --max-pages=5
```

### Skip sources that haven't changed recently

```bash
npm run scrape -- --source=all --since=24h
```

### Dry run (no DB writes)

```bash
npm run scrape -- --source=wikipedia --dry-run
```

---

## 5. Run tests

```bash
npm test
```

Tests do not require a running database.

---

## 6. Local scheduler (alternative to GitHub Actions)

```bash
npm run schedule
```

This runs node-cron inside the process:
- 03:15 UTC daily → full refresh
- Top of every hour → events only

Keep this process alive with a process manager (PM2, systemd, etc.).

---

## Environment variables reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `SCRAPER_USER_AGENT` | `QueerGuideBot/1.0` | Identifies your bot in HTTP headers and robots.txt checks |
| `POLITE_MODE` | `true` | Use longer delays between requests (recommended) |
| `MAX_CONCURRENCY` | `2` | Max simultaneous Playwright browser instances |
| `SNAPSHOT_RETENTION` | `3` | Number of raw HTML snapshots to keep per URL |
| `LOG_LEVEL` | `info` | Pino log level (`trace` `debug` `info` `warn` `error`) |
| `DISABLE_SOURCE_<NAME>` | `false` | Kill switch per source (e.g. `DISABLE_SOURCE_PATROC=true`) |

---

## GitHub Actions (production)

Add the following **secrets** to your repository:

- `DATABASE_URL` – your production DB connection string
- `SCRAPER_USER_AGENT` – your bot's user-agent string

The workflow (`.github/workflows/scrape.yml`) runs:
- **Daily at 03:15 UTC** – full refresh
- **Hourly** – events only

You can also trigger a manual run from the Actions tab with custom source/type parameters.
