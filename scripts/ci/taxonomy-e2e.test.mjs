import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { taxonomyFamilies } from '../../e2e/support/taxonomyCases.ts';
import {
  assertLocalTaxonomyEnvironment,
  TaxonomyDatabase,
} from '../../e2e/support/taxonomyDatabase.ts';

const local = {
  E2E_BASE_URL: 'http://127.0.0.1:4174',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  E2E_TAXONOMY_DB_URL: 'postgresql://postgres:local@127.0.0.1:54322/postgres',
  VITE_SUPABASE_ANON_KEY: 'synthetic-local-key',
  E2E_ADMIN_EMAIL: 'ci-admin@example.test',
  E2E_ADMIN_PASSWORD: 'synthetic-local-password',
};

test('53 families have separate mutation cases, including all 38 classifications', () => {
  assert.equal(taxonomyFamilies.length, 53);
  assert.equal(taxonomyFamilies.filter((family) => family.taxonomy).length, 38);
  assert.equal(new Set(taxonomyFamilies.map((family) => family.route)).size, 53);
  assert.ok(taxonomyFamilies.some((family) => family.id === 'event_categories'));
  assert.ok(taxonomyFamilies.some((family) => family.id === 'unified_tags'));
});

test('refuses every remote endpoint independently, even with a local frontend', () => {
  for (const [key, value] of Object.entries({
    E2E_BASE_URL: 'https://queer.guide',
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    E2E_TAXONOMY_DB_URL: 'postgresql://postgres:local@db.example.com/postgres',
  })) {
    assert.throws(() => assertLocalTaxonomyEnvironment({ ...local, [key]: value }), /loopback/);
  }
  assert.throws(() => assertLocalTaxonomyEnvironment({}), /loopback/);
});

test('refuses connection-string options and missing local auth', () => {
  assert.throws(
    () =>
      assertLocalTaxonomyEnvironment({
        ...local,
        E2E_TAXONOMY_DB_URL: local.E2E_TAXONOMY_DB_URL + '?host=db.example.com',
      }),
    /without URL options/,
  );
  assert.throws(
    () => assertLocalTaxonomyEnvironment({ ...local, E2E_ADMIN_PASSWORD: '' }),
    /credentials/,
  );
  assert.equal(assertLocalTaxonomyEnvironment(local).api.hostname, '127.0.0.1');
});

test('cleanup refuses unowned prefixes and tables before invoking psql', () => {
  const database = new TaxonomyDatabase(local);
  assert.throws(() => database.cleanup('event_categories', ''), /owned fixture prefix/);
  assert.throws(() => database.cleanup('event_categories', 'Art'), /owned fixture prefix/);
  assert.throws(
    () => database.cleanup('profiles', 'Taxonomy Regression 12345678901234567890'),
    /fixture table/,
  );
});

test('the production config excludes mutation specs and CI explicitly runs the isolated suite', () => {
  const config = readFileSync('playwright.config.ts', 'utf8');
  assert.match(config, /testIgnore: \/taxonomy-management/);
  const workflow = readFileSync('.github/workflows/e2e-pr.yml', 'utf8');
  assert.match(workflow, /steps\.db\.outputs\.mode == 'local'/);
  assert.match(workflow, /npm run test:e2e:taxonomies/);
});

test('dedicated config fails before discovery/auth when invoked with production targets', () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config',
          'playwright.taxonomy.config.ts',
          '--list',
        ],
        {
          env: { ...process.env, ...local, E2E_BASE_URL: 'https://queer.guide' },
          stdio: 'pipe',
        },
      ),
    (error) => {
      assert.match(error.stderr.toString(), /loopback frontend/);
      return true;
    },
  );
});
