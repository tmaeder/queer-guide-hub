/**
 * gaycities.com weekly upcoming-events sync.
 *
 * Sweeps every curated metro for events in [today, today+12mo] via the AJAX
 * listing endpoint, fetches detail pages for ids not yet in event_sources,
 * and publishes commit-ready rows to ingestion_staging. The events staging
 * drain crons (pg_cron) walk them through validate → dedupe → review →
 * commit within the hour.
 *
 * Stateless by design: staging idempotency (payload hash + idempotency key)
 * and the event_sources lookup make re-runs cheap no-ops.
 *
 * Env: SUPABASE_DB_URL. Run: npx tsx scripts/gaycities-sync.ts
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool } from 'pg';
import {
  openGaycitiesSession,
  fetchListing,
  parseListingCards,
  fetchDetail,
  normalizeGcEvent,
  jitterDelay,
  fmtUs,
  liveMetros,
  type MetroInfo,
  type EventStub,
} from '../src/sources/gaycities/lib.js';
import { publishToStaging, shutdownPublisher, type PublishableEntity } from '../src/db/staging-publisher.js';

const CURATED_METROS = path.resolve(import.meta.dirname, '../src/sources/gaycities/metros.json');

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function knownSourceIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const url = process.env.SUPABASE_DB_URL ?? process.env.PUBLISH_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL not set');
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    const res = await pool.query(
      `SELECT source_entity_id FROM public.event_sources
       WHERE source_slug = 'gaycities' AND source_entity_id = ANY($1)
       UNION
       SELECT source_entity_id FROM public.ingestion_staging
       WHERE source_name = 'gaycities' AND source_entity_id = ANY($1)
         AND disposition NOT IN ('rejected')`,
      [ids],
    );
    return new Set(res.rows.map((r: { source_entity_id: string }) => r.source_entity_id));
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const allMetros = JSON.parse(fs.readFileSync(CURATED_METROS, 'utf8')) as MetroInfo[];
  const metros = liveMetros(allMetros);
  const from = fmtUs(new Date());
  const to = fmtUs(new Date(Date.now() + 365 * 86_400_000));
  log(`sync window ${from} → ${to}, ${metros.length} metros`);

  let session = await openGaycitiesSession();
  const stubs = new Map<string, EventStub & { metroId: string }>();
  let requests = 0;
  try {
    for (const metro of metros) {
      for (let pageNo = 1; pageNo <= 30; pageNo++) {
        let html: string;
        try {
          html = await fetchListing(session.page, { metroId: metro.metroId, from, to, page: pageNo });
        } catch (err) {
          log(`listing error metro=${metro.metroId}: ${(err as Error).message}`);
          break;
        }
        requests++;
        const cards = parseListingCards(html);
        if (cards.length === 0) break;
        let fresh = 0;
        for (const c of cards) {
          if (!stubs.has(c.numericId)) {
            stubs.set(c.numericId, { ...c, metroId: metro.metroId });
            fresh++;
          }
        }
        if (fresh === 0 && pageNo > 1) break;
        await jitterDelay(1_200, 800);
        if (requests % 300 === 0) {
          await session.close();
          session = await openGaycitiesSession();
        }
      }
    }
    log(`listing sweep found ${stubs.size} upcoming events`);

    const known = await knownSourceIds(Array.from(stubs.keys()));
    const fresh = Array.from(stubs.values()).filter((s) => !known.has(s.numericId));
    log(`${fresh.length} not yet known — fetching details`);

    const byMetroId = new Map(allMetros.map((m) => [m.metroId, m]));
    const bySubdomain = new Map(allMetros.filter((m) => m.subdomain).map((m) => [m.subdomain as string, m]));
    const entities: PublishableEntity[] = [];
    let rejects = 0;
    let n = 0;
    for (const stub of fresh) {
      try {
        const detail = await fetchDetail(session.page, stub.detailUrl);
        if (detail.dead) continue;
        const metro =
          byMetroId.get(stub.metroId) ?? (detail.subdomain ? bySubdomain.get(detail.subdomain) : undefined) ?? null;
        const norm = normalizeGcEvent(detail, metro);
        if ('reject' in norm) {
          rejects++;
          continue;
        }
        entities.push({
          source_name: 'gaycities',
          source_id: stub.numericId,
          entity_type: 'event',
          url: detail.url,
          raw_data: {
            jsonLd: detail.jsonLd,
            tagSlugs: detail.tagSlugs,
            subdomain: detail.subdomain,
            fromWayback: false,
            url: detail.url,
          },
          fetched_at: new Date(),
          normalized_data: norm,
        });
      } catch (err) {
        log(`detail error ${stub.detailUrl}: ${(err as Error).message}`);
      }
      n++;
      if (n % 50 === 0) log(`details ${n}/${fresh.length}`);
      if (n % 300 === 0) {
        await session.close();
        session = await openGaycitiesSession();
      }
      await jitterDelay();
    }

    let inserted = 0;
    for (let i = 0; i < entities.length; i += 200) {
      const res = await publishToStaging(entities.slice(i, i + 200), {
        sourceSlug: 'gaycities',
        sourceType: 'browser',
        targetTable: 'events',
      });
      inserted += res.inserted;
    }
    log(`sync complete: swept=${stubs.size} new=${fresh.length} staged=${inserted} rejects=${rejects}`);
  } finally {
    await session.close();
    await shutdownPublisher();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
