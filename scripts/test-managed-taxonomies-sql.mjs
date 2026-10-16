import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  await db.exec(readFileSync('supabase/tests/fixtures/managed-taxonomies-bootstrap.sql', 'utf8'));
  // Use the real existing CMS audit implementation, not a trigger stub.
  const revisions = readFileSync(
    'supabase/migrations/50010101100000_content_revisions.sql',
    'utf8',
  );
  for (const table of ['content_versioned_tables', 'content_revisions']) {
    const match = revisions.match(
      new RegExp(`CREATE TABLE IF NOT EXISTS public.${table} \\([\\s\\S]*?\\n\\);`),
    );
    if (!match) throw new Error(`Missing revision dependency: ${table}`);
    await db.exec(match[0]);
  }
  const policyStart = revisions.indexOf(
    'ALTER TABLE public.content_revisions ENABLE ROW LEVEL SECURITY;',
  );
  const policyEnd = revisions.indexOf('-- ── The trigger', policyStart);
  await db.exec(revisions.slice(policyStart, policyEnd));
  const log = revisions.match(
    /CREATE OR REPLACE FUNCTION public\.log_content_revision\(\)[\s\S]*?END \$\$;/,
  );
  if (!log) throw new Error('Missing revision trigger function');
  await db.exec(log[0]);
  await db.exec(
    readFileSync('supabase/migrations/99991792111873_complete_backend_taxonomies.sql', 'utf8'),
  );
  await db.exec(
    readFileSync('supabase/migrations/99991792111874_managed_reference_taxonomies.sql', 'utf8'),
  );
  await db.exec(
    'create trigger trg_marketplace_listings_aa_derive before insert or update on public.marketplace_listings for each row execute function public.marketplace_listings_derive_taxonomy()',
  );
  await db.exec(
    readFileSync(
      'supabase/migrations/99991792111875_managed_profile_preference_vocabularies.sql',
      'utf8',
    ),
  );
  await db.exec(
    readFileSync('supabase/migrations/99991792111876_managed_organisation_roles.sql', 'utf8'),
  );
  await db.exec(readFileSync('supabase/tests/managed_taxonomies.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/managed_reference_taxonomies.sql', 'utf8'));
  console.log('Managed taxonomy migration and CRUD/RLS regression checks passed.');
} catch (error) {
  console.error(error.message, error.detail ?? '', error.where ?? '');
  process.exitCode = 1;
} finally {
  await db.close();
}
