/**
 * Stage harvested gaycities details into ingestion_staging via the Supabase
 * Management API SQL endpoint — for operator machines that have the Supabase
 * CLI logged in (keychain token) but no direct SUPABASE_DB_URL.
 *
 * Same normalization + idempotency as gaycities-backfill.ts --phase stage
 * (identical payload_hash via stableStringify/sha256, ON CONFLICT DO NOTHING);
 * safe to run incrementally while the wayback/details harvest is still going —
 * staged ids are checkpointed in .gaycities-state/staged.jsonl.
 *
 * Token: `security find-generic-password -s "Supabase CLI" -w` (go-keyring
 * base64 wrapping handled). A browser-ish User-Agent is required (CF 1010).
 *
 * Usage: npx tsx scripts/gaycities-stage-mgmt.ts [--batch 150] [--max N]
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalizeGcEvent, type EventDetail, type MetroInfo } from '../src/sources/gaycities/lib.js';
import { stableStringify, sha256 } from '../src/db/staging-publisher.js';

const STATE_DIR = path.resolve(import.meta.dirname, '../.gaycities-state');
const CURATED_METROS = path.resolve(import.meta.dirname, '../src/sources/gaycities/metros.json');
const PROJECT = 'xqeacpakadqfxjxjcewc';
const f = (name: string) => path.join(STATE_DIR, name);

function argNum(flag: string, dflt: number): number {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}
const BATCH = argNum('--batch', 150);
const MAX = argNum('--max', Infinity);

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function mgmtToken(): string {
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim();
  const b64 = raw.startsWith('go-keyring-base64:') ? raw.slice('go-keyring-base64:'.length) : raw;
  const token = raw.startsWith('go-keyring-base64:') ? Buffer.from(b64, 'base64').toString('utf8').trim() : raw;
  if (!token.startsWith('sbp_')) throw new Error('unexpected token format from keychain');
  return token;
}

async function runSql(token: string, query: string): Promise<unknown> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`mgmt_sql_${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

interface StageRow {
  sid: string;
  raw: unknown;
  norm: unknown;
  hash: string;
}

function buildSql(rows: StageRow[]): string {
  const payload = JSON.stringify(rows);
  let tag = 'gcstage';
  while (payload.includes(`$${tag}$`)) tag += 'x';
  return `
INSERT INTO public.ingestion_staging
  (raw_data, normalized_data, source_type, source_name, source_entity_id, payload_hash,
   target_table, entity_type, pipeline_run_id, disposition, ai_validation_status,
   dedup_status, created_at, updated_at)
SELECT x->'raw', x->'norm', 'browser', 'gaycities', x->>'sid', x->>'hash',
       'events', 'event', NULL, 'pending', 'pending', 'pending', now(), now()
FROM jsonb_array_elements($${tag}$${payload}$${tag}$::jsonb) AS x
ON CONFLICT DO NOTHING;`;
}

async function main(): Promise<void> {
  const token = mgmtToken();
  const metros = JSON.parse(fs.readFileSync(CURATED_METROS, 'utf8')) as MetroInfo[];
  const byMetroId = new Map(metros.map((m) => [m.metroId, m]));
  const bySubdomain = new Map(metros.filter((m) => m.subdomain).map((m) => [m.subdomain as string, m]));
  const byCity = new Map<string, MetroInfo>();
  for (const m of metros) {
    byCity.set(m.city.toLowerCase(), m);
    byCity.set(m.label.toLowerCase(), m);
  }
  const staged = new Set(readJsonl<{ numericId: string }>(f('staged.jsonl')).map((s) => s.numericId));
  const details = readJsonl<EventDetail & { numericId: string; metroId: string | null }>(f('details.jsonl'));
  log(`stage-mgmt: ${details.length} details, ${staged.size} already staged`);

  const seenThisRun = new Set<string>();
  let batch: StageRow[] = [];
  let batchIds: string[] = [];
  let inserted = 0, rejected = 0, sent = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    for (let attempt = 0; ; attempt++) {
      try {
        await runSql(token, buildSql(batch));
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
        log(`batch failed (${(err as Error).message.slice(0, 120)}) — retrying`);
        await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
      }
    }
    for (const id of batchIds) fs.appendFileSync(f('staged.jsonl'), JSON.stringify({ numericId: id }) + '\n');
    sent += batch.length;
    log(`staged ${sent} rows`);
    batch = [];
    batchIds = [];
  };

  for (const d of details) {
    if (sent >= MAX) break;
    if (!d.numericId || staged.has(d.numericId) || seenThisRun.has(d.numericId)) continue;
    seenThisRun.add(d.numericId);
    const locality = (() => {
      const loc = ((d.jsonLd as Record<string, unknown> | null)?.['location'] ?? {}) as Record<string, unknown>;
      const addr = (loc['address'] ?? {}) as Record<string, unknown>;
      return typeof addr['addressLocality'] === 'string' ? (addr['addressLocality'] as string).toLowerCase() : null;
    })();
    const metro =
      (d.metroId && byMetroId.get(d.metroId)) ||
      (d.subdomain && bySubdomain.get(d.subdomain)) ||
      (locality && byCity.get(locality)) ||
      null;
    const norm = normalizeGcEvent(d, metro || null);
    if ('reject' in norm) {
      fs.appendFileSync(f('rejects.jsonl'), JSON.stringify({ numericId: d.numericId, url: d.url, reason: norm.reject }) + '\n');
      rejected++;
      continue;
    }
    const raw = { jsonLd: d.jsonLd, tagSlugs: d.tagSlugs, subdomain: d.subdomain, fromWayback: d.fromWayback ?? false, url: d.url };
    batch.push({ sid: d.numericId, raw, norm, hash: sha256(stableStringify(raw)) });
    batchIds.push(d.numericId);
    inserted++;
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  log(`done: prepared=${inserted} rejected=${rejected} sent=${sent}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
