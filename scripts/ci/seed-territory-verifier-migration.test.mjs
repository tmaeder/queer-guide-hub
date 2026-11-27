import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { territoryVerifierMigrationSeedSql } from './seed-territory-verifier-migration.mjs';
import { loadParser } from '../check-migration-sql.mjs';

test('synthetic verifier fixtures refuse nonlocal database targets', () => {
  for (const url of ['postgres://example.org/postgres', 'postgres://xqeacpakadqfxjxjcewc.supabase.co/postgres']) {
    assert.throws(() => territoryVerifierMigrationSeedSql(url), /loopback/);
  }
  assert.throws(() => territoryVerifierMigrationSeedSql(undefined));
});

test('local fixture SQL parses and covers the immutable regression IDs without replacing existing data', async () => {
  const sql = territoryVerifierMigrationSeedSql('postgres://postgres@127.0.0.1:54322/postgres');
  const historical = readFileSync(new URL('../../supabase/migrations/20261119190359_geo_cms_territory_country_comparison.sql', import.meta.url), 'utf8');
  const ids = new Set([...historical.matchAll(/'([a-f0-9-]{36})'::uuid/g)].map((m) => m[1]));
  assert.equal(ids.size, 4);
  for (const id of ids) assert.ok(sql.includes(id), `Missing regression fixture ${id}`);
  assert.equal((sql.match(/on conflict\(id\) do nothing/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /(?:update|insert into|delete from)\s+(?:public\.)?geo_boundaries/i);
  const parse = await loadParser();
  await parse(sql);
});
