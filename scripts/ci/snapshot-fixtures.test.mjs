import { eventArtworkMigrationSeedSql } from './seed-event-artwork-migration.mjs';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  collectFixtureSlugs,
  manifestSql,
  assertLocalDatabase,
  adminSeedSql,
} from './snapshot-fixtures.mjs';

test('actual positive browser routes are prioritized, including regex redirects', () => {
  const slugs = collectFixtureSlugs();
  for (const slug of [
    'lesbian',
    'transgender',
    'acceptance',
    'checkpoint-zuerich',
    'scum-and-villainy-cantina',
    'lehighton',
    'demask',
    'supergayunderwear',
  ]) {
    assert(slugs.includes(slug), slug);
  }
});

test('fixture discovery reads source without executing it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snapshot-fixtures-'));
  try {
    writeFileSync(
      join(dir, 'fixture.spec.ts'),
      'throw new Error("must not run");\n' +
        "page.goto('/venues/fixture-a'); page.waitForURL(/\\/organizations\\/fixture-b/);",
    );
    assert.deepEqual(collectFixtureSlugs(dir), ['fixture-a', 'fixture-b']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sampling stays bounded and anonymous while retaining breadcrumb parents', () => {
  const sql = manifestSql({ slugs: ["fixture's"], rowCap: 3000 });
  assert(sql.includes("has_table_privilege('anon'"));
  const exporter = readFileSync(new URL('./db-snapshot.sh', import.meta.url), 'utf8');
  assert(exporter.includes('echo "set role anon;"'));
  assert(exporter.includes(String.raw`set request.jwt.claims = '{\"role\":\"anon\"}';`));
  assert(sql.includes("fixture''''s"));
  assert(sql.includes('public.venues'));
  assert(sql.includes('public.hotels'));
  assert(sql.includes('public.events'));
  assert(sql.includes('public.sti_profiles'));
  assert(sql.includes('public.substance_interactions'));
  assert(sql.includes('partition by subcategory_group,status,overview_eligible,content_rating'));
  assert(sql.includes("interval ''120 days''"));
  assert(sql.includes('limit 3000'));
  assert.throws(() => manifestSql({ rowCap: 0 }));
  assert.throws(() => manifestSql({ rowCap: NaN }));
});

test('synthetic records cannot be seeded into production or lookalike hosts', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    assert.doesNotThrow(() =>
      assertLocalDatabase('postgresql://postgres:local@' + hostname + ':54322/postgres'),
    );
  }
  for (const hostname of ['db.example.com', 'localhost.example.com', '127.0.0.1.example.com']) {
    assert.throws(() =>
      assertLocalDatabase('postgresql://postgres:local@' + hostname + '/postgres'),
    );
  }
});

test('admin fixtures contain static configuration and synthetic records, not production review data', () => {
  const config = JSON.parse(
    readFileSync(new URL('./review-configuration.json', import.meta.url), 'utf8'),
  );
  assert.equal(new Set(config.sources.map((row) => row.queue_key)).size, config.sources.length);
  assert(config.sources.length >= 18);
  const allowed = [
    'queue_key',
    'view_name',
    'label',
    'min_role',
    'risk',
    'public_impact',
    'sla_hours',
    'priority_weight',
    'can_reopen',
    'active',
    'lock_table',
  ];
  for (const row of config.sources) {
    assert(Object.keys(row).every((key) => allowed.includes(key)));
    assert.match(row.view_name, /^[a-z_]+$/);
  }
  const sql = adminSeedSql();
  assert(sql.includes('CI synthetic'));
  assert(sql.includes('refresh_admin_review_queue_counts()'));
  assert(sql.includes('refresh_admin_review_queue_top()'));
  assert(sql.includes("stage='ready'"));
});

test('compatible daily snapshots are reusable and source/fixture changes invalidate them', async () => {
  const { snapshotCacheKey } = await import('./snapshot-fixtures.mjs');
  const inputs = {
    day: '2026-10-22',
    manifest: 'fixture-query',
    snapshotScript: 'export-script',
    workflow: 'workflow',
  };
  const key = snapshotCacheKey(inputs);
  assert.equal(key, snapshotCacheKey({ ...inputs }));
  assert.notEqual(key, snapshotCacheKey({ ...inputs, manifest: 'new-fixture-query' }));
  assert.notEqual(key, snapshotCacheKey({ ...inputs, snapshotScript: 'new-export-script' }));
  assert.notEqual(key, snapshotCacheKey({ ...inputs, workflow: 'new-workflow' }));
  assert.notEqual(key, snapshotCacheKey({ ...inputs, day: '2026-10-23' }));
});

test('RPC fixture verification refuses to send credentials to a remote API', async () => {
  const { verifyLocalFixtures } = await import('./snapshot-fixtures.mjs');
  await assert.rejects(
    verifyLocalFixtures({ API_URL: 'https://production.example.com' }),
    /loopback/,
  );
});

test('main sync keeps the full glossary and only the four static registry exceptions', () => {
  const sql = manifestSql({ slugs: [] });
  assert(
    sql.includes(
      "c.relname <> all(ARRAY['unified_tags','admin_review_sources','admin_review_finding_codes','triage_sources','review_field_registry']::text[])",
    ),
  );
  assert(
    sql.includes(
      "or c.relname = any(ARRAY['admin_review_sources','admin_review_finding_codes','triage_sources','review_field_registry']::text[])",
    ),
  );
  assert(!sql.includes("'review_queue'"));
  assert.throws(() => manifestSql({ fullTables: ["tags'); drop table users; --"] }));
});

// The exported builder also enforces locality, not just the CLI entry point.
test('artwork migration dependencies refuse remote databases and never invoke providers', () => {
  assert.throws(() => eventArtworkMigrationSeedSql('postgresql://db.example.com/postgres'), /loopback/);
  const sql = eventArtworkMigrationSeedSql('postgresql://127.0.0.1/postgres');
  assert(sql.includes("'command','select 1'"));
  assert(!sql.includes('http_post'));
  assert(!sql.includes('vault'));
});
