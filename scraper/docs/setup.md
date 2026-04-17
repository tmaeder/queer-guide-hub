# Setup Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or Supabase project)
- Playwright browsers (installed automatically)

## Local Setup

1. Clone and install:

```bash
cd scraper
npm install
npx playwright install chromium --with-deps
```

2. Configure environment:

```bash
cp .env.example .env
# Edit .env with your database URL
```

3. Run database migrations:

```bash
npm run scrape -- migrate
```

4. Test the setup:

```bash
npm run test
npm run scrape -- list-sources
```

## Database Setup

### Option A: Local PostgreSQL

```bash
createdb queer_guide_scraper
# Set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/queer_guide_scraper
npm run scrape -- migrate
```

### Option B: Supabase

The schema uses a `scraper_` prefix on all tables to avoid conflicts with the existing queer.guide schema. Set `DATABASE_URL` to your Supabase connection string (found in Settings > Database > Connection string > URI).

## Running the Scraper

### Single source:

```bash
npm run scrape -- scrape --source wikipedia
npm run scrape -- scrape --source iglta --type event
npm run scrape -- scrape --source outsavvy --type event
```

### All sources:

```bash
npm run scrape -- scrape --source all
```

### Dry run (no DB writes):

```bash
npm run scrape -- scrape --source wikipedia --dry-run
```

### Limit pages:

```bash
npm run scrape -- scrape --source patroc --max-pages 5
```

### Start local cron scheduler:

```bash
npm run scrape -- scheduler
```

## GitHub Actions

The `.github/workflows/scrape.yml` workflow runs:
- **Daily at 03:15 UTC**: Full refresh of all sources
- **Hourly at :30**: Events-only refresh (IGLTA, Outsavvy, Patroc)
- **Manual dispatch**: Select source, type, and dry-run from GitHub UI

Required GitHub secret: `DATABASE_URL`

## Kill Switches

Disable any source by setting an environment variable:

```bash
DISABLE_SOURCE_TRAVELGAY=true npm run scrape -- scrape --source all
```

Or set in `.env`:

```
DISABLE_SOURCE_MISTERBNB=true
```
