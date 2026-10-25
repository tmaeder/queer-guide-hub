import { randomUUID } from 'node:crypto';
import { test as base } from '@playwright/test';
import { assertLocalTaxonomyEnvironment, TaxonomyDatabase } from './taxonomyDatabase';

interface TaxonomyFixture {
  prefix: string;
  key: string;
  database: TaxonomyDatabase;
  own: (table: string) => void;
  enableIntimate: () => void;
}

export const test = base.extend<{ taxonomy: TaxonomyFixture }>({
  taxonomy: async ({ context, page }, runTest, testInfo) => {
    const { api } = assertLocalTaxonomyEnvironment();
    const database = new TaxonomyDatabase();
    const uuid = randomUUID();
    const prefix = `Taxonomy Regression ${BigInt('0x' + uuid.replaceAll('-', '')).toString()}`;
    const tables: string[] = [];
    const blocked: string[] = [];
    let restoreIntimate: ReturnType<TaxonomyDatabase['enableIntimateAdmin']> | undefined;
    const errors: unknown[] = [];
    // Consent is a fixture prerequisite, as in tag-discovery.spec.ts. Seed a
    // real necessary-only preference before the lazy banner can cover links
    // near the bottom of the 53-family directory, including after reloads.
    await context.addInitScript(() => {
      localStorage.setItem(
        'queer-guide-cookie-consent',
        JSON.stringify({
          preferences: { necessary: true, functional: false, analytics: false, marketing: false },
          version: '1.0',
          timestamp: new Date().toISOString(),
        }),
      );
    });
    await context.route(/\/(?:rest|auth|functions|storage)\/v1\//, async (route) => {
      if (new URL(route.request().url()).origin !== api.origin) {
        blocked.push(new URL(route.request().url()).origin);
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    try {
      await runTest({
        prefix,
        key: `taxonomy-regression-${uuid}`,
        database,
        own: (table) => {
          if (!tables.includes(table)) tables.push(table);
        },
        enableIntimate: () => {
          restoreIntimate ??= database.enableIntimateAdmin(process.env.E2E_ADMIN_EMAIL!);
        },
      });
    } catch (error) {
      errors.push(error);
    } finally {
      // Stop in-flight browser writes before cleanup, including failed saves
      // whose response never reached the test. Ownership is registered BEFORE
      // clicking Save and does not depend on receiving the returned UUID.
      try {
        await page.close();
      } catch (error) {
        errors.push(error);
      }
      const cleanup: unknown[] = [];
      for (const table of tables.reverse()) {
        try {
          cleanup.push(database.cleanup(table, prefix));
        } catch (error) {
          errors.push(error);
        }
      }
      let eligibility: ReturnType<NonNullable<typeof restoreIntimate>> | undefined;
      try {
        eligibility = restoreIntimate?.();
      } catch (error) {
        errors.push(error);
      }
      if (blocked.length)
        errors.push(new Error(`Blocked non-local API requests: ${blocked.join(', ')}`));
      await testInfo.attach('fixture-cleanup', {
        body: JSON.stringify(
          { prefix, cleanup, eligibility, failures: errors.map(String) },
          null,
          2,
        ),
        contentType: 'application/json',
      });
    }
    if (errors.length) throw new AggregateError(errors, 'Taxonomy fixture teardown failed');
  },
});

export { expect } from '@playwright/test';
