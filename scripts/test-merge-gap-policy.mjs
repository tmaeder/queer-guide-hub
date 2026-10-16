// Real, isolated PostgreSQL. Creates and removes its own cluster; never uses an
// application connection string. PG_BIN can point to PostgreSQL 17 binaries.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { planSourceCombinations } from '../supabase/functions/pipeline-commit/combine-sources.ts';
const pgBin = process.env.PG_BIN || (existsSync('/opt/homebrew/opt/postgresql@17/bin/initdb') ? '/opt/homebrew/opt/postgresql@17/bin' : '');
const root = mkdtempSync('/tmp/qg-merge-test-');
const executable = (name) => pgBin ? join(pgBin, name) : name;
const run = (name, args, input) => execFileSync(executable(name), args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const pgArgs = ['-h', root, '-p', '5432', '-v', 'ON_ERROR_STOP=1', '-qAt'];
const sql = (database, input) => run('psql', [...pgArgs, '-d', database], input);
const migrationFiles = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
const migration = migrationFiles.find((file) => file.endsWith('_merge_gap_policy.sql'));
const cache = new Map();
function latestDefinition(name) {
  for (const file of [...migrationFiles].reverse()) {
    if (file === migration) continue;
    if (!cache.has(file)) cache.set(file, readFileSync(join('supabase/migrations', file), 'utf8'));
    const source = cache.get(file);
    const match = new RegExp(`^\\s*CREATE OR REPLACE FUNCTION (?:"?public"?\\.)?"?${name}"?\\(`, 'im').exec(source);
    if (!match) continue;
    const start = match.index;
    const header = /\bAS\s+(\$(?:\w+)?\$)/i.exec(source.slice(start));
    if (!header) continue;
    const bodyStart = start + header.index + header[0].length;
    const end = source.indexOf(header[1], bodyStart);
    if (end < 0) throw new Error('Unclosed function ' + name);
    return source.slice(start, source.indexOf(';', end + header[1].length) + 1);
  }
  throw new Error('Missing function ' + name);
}
function bootstrap(database, actualItems) {
  run('createdb', ['-h', root, '-p', '5432', database]);
  run('psql', [...pgArgs, '-d', database, '-f', 'supabase/tests/fixtures/merge-gap-policy.sql']);
  const batchDefinitions = ['news_commit_staging_batch', 'commit_village_staging_batch'].map(latestDefinition).join('\n');
  sql(database, batchDefinitions);
  if (actualItems) {
    const names = ['venue', 'event', 'city', 'country', 'marketplace', 'personality'].map((kind) => `commit_${kind}_staging_item`);
    sql(database, names.map((name) => `DROP FUNCTION ${name}(uuid,text);`).join('\n'));
    sql(database, names.map(latestDefinition).join('\n'));
  }
  sql(database, readFileSync(join('supabase/migrations', migration), 'utf8'));
}
let started = false;
try {
  run('initdb', ['-D', join(root, 'data'), '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', join(root, 'data'), '-l', join(root, 'postgres.log'), '-o', `-k ${root} -c listen_addresses=''`, 'start']);
  started = true;
  bootstrap('behavior', false);
  run('psql', [...pgArgs, '-d', 'behavior', '-f', 'supabase/tests/merge_gap_policy.sql']);
  bootstrap('real_definitions', true);
  const compiled = JSON.parse(sql('real_definitions', `SELECT json_agg(proname) FROM pg_proc WHERE proname LIKE 'commit_%_staging_item' AND pg_get_functiondef(oid) LIKE '%merge_gap_patch%';`));
  assert.equal(compiled.length, 6, 'every real item function receives the policy');
  console.log('PostgreSQL: gap fills, typed arrays/JSON, merge/undo, source evidence, CAS, review gates and eight real commit definitions passed.');
  // Representative throughput: 500 entities and 30,000 historical observations.
  sql('behavior', `
    INSERT INTO venues(id,name,description) SELECT md5('venue-'||g)::uuid,'Venue '||g,NULL FROM generate_series(1,500) g;
    INSERT INTO ingestion_staging(id,target_table,disposition,ai_validation_status,review_status,dedup_match_id,dedup_status,source_name,normalized_data,enriched_data,updated_at)
    SELECT md5('pending-'||g)::uuid,'venues','pending','approved','auto',md5('venue-'||g)::uuid,'duplicate','osm',jsonb_build_object('description','Description '||g),'{}',now() FROM generate_series(1,500) g;
    INSERT INTO ingestion_staging(id,target_table,target_record_id,disposition,ai_validation_status,review_status,source_name,normalized_data,created_at)
    SELECT md5('history-'||g||'-'||h)::uuid,'venues',md5('venue-'||g)::uuid,'updated','approved','auto',CASE h%3 WHEN 0 THEN 'wikidata' WHEN 1 THEN 'osm' ELSE 'website' END,
      jsonb_build_object('description','Description '||g),now()-h*interval '1 hour' FROM generate_series(1,500) g CROSS JOIN generate_series(1,60) h;
    ANALYZE ingestion_staging;`);
  const readSql = `SELECT set_config('test.jwt','{"role":"service_role"}',false); SELECT load_source_combination_batch('venues',NULL,100);`;
  const batch = JSON.parse(sql('behavior', readSql).trim().split('\n').at(-1));
  const start = performance.now();
  const plans = planSourceCombinations(batch, 'venues');
  const planningMs = performance.now() - start;
  assert.equal(plans.length, 100);
  const writeStart = performance.now();
  const applied = JSON.parse(sql('behavior', `SELECT set_config('test.jwt','{"role":"service_role"}',false); SELECT apply_source_combination_batch($plans$${JSON.stringify(plans)}$plans$::jsonb);`).trim().split('\n').at(-1));
  const writeMs = performance.now() - writeStart;
  assert.equal(applied.groups, 100);
  assert.equal(applied.gated, 0);
  const explain = sql('behavior', `SELECT set_config('test.jwt','{"role":"service_role"}',false); EXPLAIN (ANALYZE,FORMAT JSON) SELECT load_source_combination_batch('venues',NULL,100);`);
  const plan = JSON.parse(explain.slice(explain.indexOf('[')));
  const stale = JSON.parse(sql('behavior', `SELECT set_config('test.jwt','{"role":"service_role"}',false); SELECT apply_source_combination_batch($plans$${JSON.stringify(plans)}$plans$::jsonb);`).trim().split('\n').at(-1));
  assert.equal(stale.stale, 100, 'stale batches do not overwrite newer staging decisions');
  sql('behavior', `SELECT commit_venue_staging_item(v::uuid) FROM jsonb_array_elements_text($ids$${JSON.stringify(plans.map((p) => p.primary))}$ids$) v;`);
  assert.equal(Number(sql('behavior', `SELECT count(*) FROM venues WHERE description='Description '||substring(name FROM 7);`).trim()),100,'accepted source combinations reach the canonical records');
  const refreshed = JSON.parse(sql('behavior', readSql).trim().split('\n').at(-1));
  assert.equal(planSourceCombinations(refreshed,'venues').length,0,'no writes when existing gaps are already filled');
  console.log(`Benchmark: 100 groups, up to 50 observations each, ${planningMs.toFixed(1)} ms JS planning; ${plan[0]['Execution Time'].toFixed(1)} ms database evidence read; ${writeMs.toFixed(1)} ms batch apply including psql startup; two RPCs per batch.`);
} finally {
  if (started) run('pg_ctl', ['-D', join(root, 'data'), '-m', 'immediate', 'stop']);
  rmSync(root, { recursive: true, force: true });
}
