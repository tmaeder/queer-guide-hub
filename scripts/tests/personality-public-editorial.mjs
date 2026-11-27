// Isolated PostgreSQL contract test. No network or production writes.
// node scripts/tests/personality-public-editorial.mjs /path/to/pglite/dist/index.js
// The optional path allows an external PGlite install without changing app dependencies.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const moduleName = process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const db = await PGlite.create();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE outsider;
    CREATE TABLE public.personalities(id uuid PRIMARY KEY, visibility text, duplicate_of_id uuid, lgbti_connection text, lgbti_details text);
    CREATE TABLE public.personality_sources(id uuid PRIMARY KEY, personality_id uuid, source_url text);
    CREATE TABLE public.personality_claim_sources(personality_id uuid, source_id uuid, field_name text, verification_status text);
    CREATE TABLE public.content_translations(record_id uuid, table_name text, field_name text, language text, value text, status text);
    INSERT INTO public.personalities SELECT ('00000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid,
      CASE WHEN i=2 THEN 'draft' ELSE 'public' END,
      CASE WHEN i=3 THEN '00000000-0000-0000-0000-000000000001'::uuid END,
      'activist', 'A reviewed explanation.' FROM generate_series(1,7) i;
    INSERT INTO public.personality_sources SELECT id,id,CASE WHEN id::text LIKE '%000006' THEN 'javascript:alert(1)' ELSE 'https://example.org/source' END FROM public.personalities;
    INSERT INTO public.personality_claim_sources SELECT id,id,'lgbti_connection',
      CASE WHEN id::text LIKE '%000004' THEN 'pending' WHEN id::text LIKE '%000005' THEN 'rejected' ELSE 'verified' END FROM public.personalities;
    INSERT INTO public.personality_claim_sources SELECT id,id,'lgbti_details','verified' FROM public.personalities WHERE id::text LIKE '%000007';
    INSERT INTO public.content_translations VALUES
      ('00000000-0000-0000-0000-000000000001','personalities','description','de','Veröffentlichte Beschreibung','published'),
      ('00000000-0000-0000-0000-000000000001','personalities','bio','de','DRAFT MUST NOT LEAK','draft'),
      ('00000000-0000-0000-0000-000000000001','personalities','lgbti_details','de','UNVERIFIED MUST NOT LEAK','published'),
      ('00000000-0000-0000-0000-000000000007','personalities','lgbti_details','de','Geprüfte Erklärung','published');
  `);
  await db.exec(
    await readFile(
      new URL(
        '../../supabase/migrations/20261125180346_personality_public_editorial.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await db.exec('SET ROLE anon');
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const rows = (
    await db.query('SELECT * FROM public.personality_public_editorial($1::uuid[], $2)', [
      [1, 2, 3, 4, 5, 6, 7].map(id),
      'de-CH',
    ])
  ).rows;
  assert.equal(rows.length, 5, 'drafts and duplicates excluded');
  const one = rows.find((r) => r.personality_id === id(1));
  assert.equal(one.connection, 'activist');
  assert.equal(one.details, null, 'category evidence does not verify the explanation');
  assert.deepEqual(
    one.translations,
    { description: 'Veröffentlichte Beschreibung' },
    'only published verified fields returned',
  );
  for (const n of [4, 5, 6]) {
    const row = rows.find((r) => r.personality_id === id(n));
    assert.equal(row.connection, null, 'pending/rejected/executable sources hidden');
    assert.deepEqual(row.sources, []);
  }
  const seven = rows.find((r) => r.personality_id === id(7));
  assert.equal(seven.details, 'A reviewed explanation.');
  assert.equal(seven.translations.lgbti_details, 'Geprüfte Erklärung');
  const capped = (
    await db.query('SELECT * FROM public.personality_public_editorial($1::uuid[], $2)', [
      [...Array(100).fill(id(99)), id(1)],
      'en',
    ])
  ).rows;
  assert.equal(capped.length, 0, 'id arrays are bounded to 100');
  await assert.rejects(
    db.query('SELECT * FROM public.personality_claim_sources'),
    /permission denied/,
    'claims remain private',
  );
  await db.exec('RESET ROLE; SET ROLE outsider');
  await assert.rejects(
    db.query('SELECT * FROM public.personality_public_editorial($1::uuid[], $2)', [[id(1)], 'en']),
    /permission denied/,
    'no implicit PUBLIC grant',
  );
  console.log(
    'Passed: public visibility, duplicates, verified claims, field-specific evidence, translations, source URLs, batch bound, private claims and explicit grants.',
  );
} finally {
  await db.close();
}
