import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertPublishableKey,
  validateBatch,
  compileBatch,
  prepareBatch,
  batchDigest,
  verifyBatch,
  queueBatch,
  releaseReceipt,
} from './personality-editorial-batch.mjs';
const { PGlite } = await import(
  process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
);
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const fixture = (count = 1) => ({
  schema_version: 1,
  id: 'editorial-contract-batch',
  reviewer: 'source-review-test',
  reviewed_at: '2026-01-01T00:00:00Z',
  records: Array.from({ length: count }, (_, i) => ({
    id: id(i + 1),
    name: `Example ${i + 1}`,
    slug: `example-${i + 1}`,
    expected: { description: 'Original summary', lgbti_details: null, lgbti_connection: null },
    metadata_before: { field_provenance: {}, lgbti_connection_source: null },
    changes: {
      description:
        'A writer whose published work explores the lives of queer people and their communities, providing documented cultural representation for readers.',
      lgbti_details:
        'The official publisher describes the book as a story about queer people and their lives. This is a documented connection through cultural work.',
      lgbti_connection: 'representation',
    },
    sources: [
      {
        url: 'https://example.org/book',
        title: 'Official publisher',
        checked_at: '2026-01-01T00:00:00Z',
        identity_match: 'exact',
        basis: 'The publisher identifies this exact author and the queer themes of the work.',
        fields: ['description', 'lgbti_details', 'lgbti_connection'],
      },
    ],
    translations: {
      de: {
        description:
          'Eine Schriftstellerin, deren Werke das Leben queerer Menschen und ihrer Gemeinschaften zeigen und damit kulturelle Repräsentation schaffen.',
        lgbti_details:
          'Der Verlag beschreibt das Buch als Geschichte über queere Menschen und ihr Leben. Dies belegt eine Verbindung durch das kulturelle Werk.',
      },
    },
    expected_translations: { de: { description: null, lgbti_details: null } },
    review: {
      status: 'reviewed',
      connection_basis: 'cultural_work',
      translation_languages: ['de'],
    },
  })),
});
async function database(batch) {
  const db = await PGlite.create();
  await db.exec(`CREATE TABLE personalities(id uuid primary key,visibility text,duplicate_of_id uuid,wikidata_qid text,description text,bio text,lgbti_details text,lgbti_connection text,profession text,pronouns text,lgbti_connection_source text,field_provenance jsonb,updated_at timestamptz,name text,slug text,birth_date date,death_date date,image_url text,image_status text,nationality text,wikipedia_url text,profile_url text,birth_place text,death_place text,cause_of_death text);
  CREATE TABLE personality_sources(id uuid primary key default gen_random_uuid(),personality_id uuid references personalities,source_slug text,source_entity_id text,source_url text,raw jsonb,confidence numeric,is_primary boolean,unique(source_slug,source_entity_id));
  CREATE TABLE personality_claim_sources(personality_id uuid,field_name text,source_id uuid references personality_sources on delete cascade,confidence numeric,verification_status text,checked_at timestamptz);
  CREATE TABLE content_translations(table_name text,record_id uuid,field_name text,language text,value text,status text,machine_source text,unique(table_name,record_id,field_name,language));`);
  if (batch.editorial_policy_version === 2)
    await db.exec(`
    CREATE SCHEMA api_private;
    CREATE FUNCTION api_private.personality_editorial_identity(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('name',p->'name','wikidata_qid',p->'wikidata_qid','birth_date',p->'birth_date') $$;
    ALTER TABLE personality_claim_sources ADD COLUMN verified_value text,ADD COLUMN verified_identity jsonb,ADD COLUMN verified_source_url text,ADD COLUMN verified_language text,ADD COLUMN reviewed_by text,ADD COLUMN editorial_invalidated_txid text;
    ALTER TABLE content_translations ADD COLUMN source_hash text,ADD COLUMN source_lang text,ADD COLUMN editorial_reviewed_by text,ADD COLUMN editorial_reviewed_at timestamptz,ADD COLUMN editorial_reviewed_value text,ADD COLUMN editorial_reviewed_identity jsonb;
  `);
  for (const r of batch.records)
    await db.query(
      "INSERT INTO personalities(id,visibility,description,bio,lgbti_details,lgbti_connection,field_provenance,lgbti_connection_source,name,slug,wikidata_qid,birth_date,profession,pronouns) VALUES($1,'public',$2,$7,$3,$4,$5::jsonb,$6,$8,$9,$10,$11,$12,$13)",
      [
        r.id,
        r.expected.description,
        r.expected.lgbti_details,
        r.expected.lgbti_connection,
        JSON.stringify(r.metadata_before.field_provenance),
        r.metadata_before.lgbti_connection_source,
        Object.hasOwn(r.expected, 'bio') ? r.expected.bio : 'Untouched biography',
        r.name,
        r.slug,
        r.expected_identity?.wikidata_qid ?? null,
        r.expected_identity?.birth_date ?? null,
        r.expected.profession ?? null,
        r.expected.pronouns ?? null,
      ],
    );
  for (const r of batch.records.filter((r) => r.identity_correction))
    for (const [field, value] of Object.entries(r.identity_correction.before)) {
      const column = '"' + field.replaceAll('"', '""') + '"';
      await db.query(
        `UPDATE personalities SET ${column}=(jsonb_populate_record(NULL::personalities,$1::jsonb)).${column} WHERE id=$2`,
        [JSON.stringify({ [field]: value }), r.id],
      );
    }
  return db;
}

test('review gate rejects unsupported identity claims, unsafe URLs and incomplete snapshots', () => {
  assert.equal(validateBatch(fixture()).profiles, 1);
  for (const change of [
    (b) => (b.records[0].review.status = 'draft'),
    (b) => (b.records[0].changes.lgbti_connection = 'community_member'),
    (b) => (b.records[0].sources[0].url = 'javascript:alert(1)'),
    (b) => b.records[0].sources[0].fields.pop(),
    (b) => delete b.records[0].expected.description,
    (b) => delete b.records[0].expected_translations.de.description,
    (b) => b.records.push(b.records[0]),
    (b) => b.records[0].sources.push(b.records[0].sources[0]),
  ]) {
    const batch = fixture();
    change(batch);
    assert.throws(() => validateBatch(batch));
  }
});
test('language checks catch wrong-language translations and mixed-script words', () => {
  const b = fixture();
  b.records[0].translations.de.description = b.records[0].changes.description;
  assert.throws(() => validateBatch(b), /translation language/);
  const c = fixture();
  c.records[0].changes.description += ' wor\u0434';
  assert.throws(() => validateBatch(c), /Mixed-script/);
});
test('generic biography template cannot be approved as a sourced fact', () => {
  const batch = fixture();
  batch.records[0].expected.bio = null;
  batch.records[0].changes.bio =
    'Example is a notable figure in the LGBTQ community, known for visibility and acceptance.';
  assert.throws(() => validateBatch(batch), /Replace generic biography/);
});
test('SQL application and rollback preserve unrelated later edits and reject replay', async () => {
  const b = fixture(),
    db = await database(b),
    sql = compileBatch(b);
  try {
    await db.exec(sql.apply);
    assert.equal(
      (await db.query('select count(*)::int n from personality_claim_sources')).rows[0].n,
      3,
    );
    await assert.rejects(db.exec(sql.apply), /already applied/);
    await db.exec("update personalities set bio='Later biography'");
    await db.exec(sql.rollback);
    const row = (await db.query('select description,bio,field_provenance from personalities'))
      .rows[0];
    assert.equal(row.description, 'Original summary');
    assert.equal(row.bio, 'Later biography');
    assert.deepEqual(row.field_provenance, {});
    assert.equal((await db.query('select count(*)::int n from personality_sources')).rows[0].n, 0);
  } finally {
    await db.close();
  }
});
test('stale second record rolls back the entire batch', async () => {
  const b = fixture(2),
    db = await database(b);
  try {
    await db.query("update personalities set description='New edit' where id=$1", [id(2)]);
    await assert.rejects(db.exec(compileBatch(b).apply), /changed since review/);
    assert.equal(
      (await db.query('select description from personalities where id=$1', [id(1)])).rows[0]
        .description,
      'Original summary',
    );
    assert.equal((await db.query('select count(*)::int n from personality_sources')).rows[0].n, 0);
  } finally {
    await db.close();
  }
});
test('published translations require exact snapshots and restore an earlier draft', async () => {
  const b = fixture();
  b.records[0].expected_translations.de.description = {
    value: 'Alter Entwurf',
    status: 'draft',
    machine_source: 'seed',
  };
  const db = await database(b),
    sql = compileBatch(b);
  try {
    await assert.rejects(db.exec(sql.apply), /Translation changed/);
    await db.query(
      "insert into content_translations values('personalities',$1,'description','de','Alter Entwurf','draft','seed')",
      [id(1)],
    );
    await db.exec(sql.apply);
    await db.exec(sql.rollback);
    assert.deepEqual(
      (await db.query('select value,status,machine_source from content_translations')).rows[0],
      b.records[0].expected_translations.de.description,
    );
  } finally {
    await db.close();
  }
});
test('rollback refuses later translation changes and source reuse', async () => {
  const b = fixture(),
    db = await database(b),
    sql = compileBatch(b);
  try {
    await db.exec(sql.apply);
    await db.exec(
      "update content_translations set value='Later edit' where field_name='description'",
    );
    await assert.rejects(db.exec(sql.rollback), /Later edit protects translation/);
    await db.query("update content_translations set value=$1 where field_name='description'", [
      b.records[0].translations.de.description,
    ]);
    await db.exec(
      "insert into personality_claim_sources select personality_id,'bio',id,0.99,'verified',now() from personality_sources",
    );
    await assert.rejects(db.exec(sql.rollback), /Later source use/);
  } finally {
    await db.close();
  }
});
test('quotes and dollar delimiters in source snapshots remain data', async () => {
  const b = fixture();
  b.records[0].expected.description =
    "Original $editorial$; DROP TABLE personalities; $rollback$ O'Brien";
  b.records[0].sources[0].basis += " $editorial$ END $rollback$; O'Brien";
  const db = await database(b);
  try {
    const sql = compileBatch(b);
    await db.exec(sql.apply);
    await db.exec(sql.rollback);
    assert.equal(
      (await db.query('select description from personalities')).rows[0].description,
      b.records[0].expected.description,
    );
  } finally {
    await db.close();
  }
});
test('draft profiles and changed provenance cannot be overwritten', async () => {
  const b = fixture(),
    db = await database(b),
    sql = compileBatch(b);
  try {
    await db.exec("update personalities set visibility='draft'");
    await assert.rejects(db.exec(sql.apply));
    await db.exec(
      "update personalities set visibility='public',field_provenance='{" +
        '"description":{"source":"later-review"}' +
        "}'",
    );
    await assert.rejects(db.exec(sql.apply), /changed since review/);
  } finally {
    await db.close();
  }
});
test('freeze prevents changing a prepared batch', () => {
  const root = mkdtempSync(join(tmpdir(), 'editorial-contract-'));
  try {
    const b = fixture();
    prepareBatch(b, root);
    prepareBatch(b, root);
    b.records[0].changes.description += ' More.';
    assert.throws(() => prepareBatch(b, root), /Frozen batch changed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('anonymous verification checks fields, category, source and translation', async () => {
  const b = fixture(),
    r = b.records[0];
  let calls = 0;
  const request = async (_url, opts) => {
    calls++;
    const lang = opts.body ? JSON.parse(opts.body).p_lang : null;
    return {
      ok: true,
      json: async () =>
        lang
          ? [
              {
                personality_id: r.id,
                connection: r.changes.lgbti_connection,
                details: r.changes.lgbti_details,
                sources: [{ url: r.sources[0].url }],
                translations: r.translations[lang] || {},
              },
            ]
          : [{ id: r.id, ...r.changes }],
    };
  };
  const report = await verifyBatch(b, request, {
    url: 'https://example.org',
    key: 'public-test-key',
  });
  assert.equal(report.passed, true);
  assert.equal(calls, 3);
  r.sources[0].url = 'https://example.org/new-source';
  await assert.rejects(
    verifyBatch(b, async () => ({ ok: true, json: async () => [] }), {
      url: 'https://example.org',
      key: 'public-test-key',
    }),
  );
});
test('large batches verify every profile within the public 100-ID limit', async () => {
  const batch = fixture(500);
  const sizes = [];
  let omitLast = false;
  const request = async (url, opts) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    const ids = body?.p_ids || new URL(url).searchParams.get('id').slice(4, -1).split(',');
    sizes.push(ids.length);
    assert.ok(ids.length <= 100);
    const selected = batch.records.filter((r) => ids.includes(r.id));
    return {
      ok: true,
      json: async () =>
        body
          ? selected
              .filter((r) => !(omitLast && body.p_lang === 'de' && r.id === id(500)))
              .map((r) => ({
                personality_id: r.id,
                connection: r.changes.lgbti_connection,
                details: r.changes.lgbti_details,
                sources: [{ url: r.sources[0].url }],
                translations: r.translations[body.p_lang] || {},
              }))
          : selected.map((r) => ({ id: r.id, ...r.changes })),
    };
  };
  const config = { url: 'https://example.org', key: 'public-test-key' };
  assert.equal((await verifyBatch(batch, request, config)).profiles, 500);
  assert.deepEqual(sizes, Array(15).fill(100));
  omitLast = true;
  await assert.rejects(verifyBatch(batch, request, config), /Unverified explanation: Example 500/);
  assert.throws(() => validateBatch(fixture(501)), /1–500/);
});
test('one release receipt requires matching frozen digest, success and live commit', () => {
  const b = fixture(),
    prepared = { digest: batchDigest(b) },
    verified = { ...prepared, profiles: 1, passed: true },
    deploy = {
      name: 'Deploy to Cloudflare Pages',
      conclusion: 'success',
      headSha: 'a'.repeat(40),
      databaseId: 12,
    };
  const receipt = releaseReceipt(b, prepared, verified, deploy, deploy.headSha);
  assert.deepEqual(releaseReceipt(b, prepared, verified, deploy, deploy.headSha, receipt), receipt);
  assert.throws(
    () =>
      releaseReceipt(b, prepared, verified, { ...deploy, databaseId: 13 }, deploy.headSha, receipt),
    /another deployment/,
  );
  assert.throws(
    () => releaseReceipt(b, prepared, verified, deploy, 'b'.repeat(40)),
    /does not match/,
  );
  assert.throws(() =>
    releaseReceipt(b, prepared, verified, { ...deploy, conclusion: 'failure' }, deploy.headSha),
  );
  assert.throws(() => releaseReceipt(b, { digest: 'stale' }, verified, deploy, deploy.headSha));
});

test('queue snapshots pending public candidates without approving evidence or translations', async () => {
  const b = fixture();
  const request = async () => ({
    ok: true,
    json: async () => [
      {
        id: b.records[0].id,
        name: 'Example',
        slug: 'example',
        description: 'Original',
        lgbti_details: null,
        lgbti_connection: null,
        field_provenance: {},
        wikipedia_url: 'https://example.org/hint',
      },
    ],
  });
  const draft = await queueBatch(
    { records: [{ id: b.records[0].id, issues: ['missing_connection_explanation'] }] },
    'queued-contract-batch',
    20,
    request,
    { url: 'https://example.org', key: 'public' },
  );
  assert.equal(draft.records.length, 1);
  assert.equal(draft.records[0].review.status, 'draft');
  assert.deepEqual(draft.records[0].sources, []);
  assert.throws(() => validateBatch(draft));
});

if (process.env.PERSONALITY_BATCH_MANIFEST)
  test('the actual reviewed batch applies and rolls back against its original snapshots', async () => {
    const b = JSON.parse(readFileSync(process.env.PERSONALITY_BATCH_MANIFEST, 'utf8')),
      db = await database(b),
      sql = compileBatch(b);
    try {
      for (const r of b.records)
        for (const [language, fields] of Object.entries(r.expected_translations))
          for (const [field, old] of Object.entries(fields))
            if (old !== null) {
              const columns = [
                'value',
                'status',
                'machine_source',
                ...(b.editorial_policy_version === 2
                  ? [
                      'source_hash',
                      'source_lang',
                      'editorial_reviewed_by',
                      'editorial_reviewed_at',
                      'editorial_reviewed_value',
                      'editorial_reviewed_identity',
                    ]
                  : []),
              ];
              await db.query(
                `insert into content_translations(table_name,record_id,field_name,language,${columns.join(',')}) values('personalities',$1,$2,$3,${columns.map((_, i) => '$' + (i + 4)).join(',')})`,
                [
                  r.id,
                  field,
                  language,
                  ...columns.map((key) =>
                    key === 'editorial_reviewed_identity' && old[key] !== null
                      ? JSON.stringify(old[key])
                      : old[key],
                  ),
                ],
              );
            }
      await db.exec(sql.apply);
      const rows = (await db.query('select * from personalities')).rows;
      for (const r of b.records)
        for (const [f, v] of Object.entries(r.changes))
          assert.equal(rows.find((p) => p.id === r.id)[f], v);
      assert.equal(
        (await db.query('select count(*)::int n from personality_claim_sources')).rows[0].n,
        b.records.reduce((n, r) => n + r.sources.reduce((k, s) => k + s.fields.length, 0), 0),
      );
      await db.exec(sql.rollback);
      for (const r of b.records) {
        const restored = (await db.query('select * from personalities where id=$1', [r.id]))
          .rows[0];
        for (const field of Object.keys(r.changes))
          assert.equal(
            restored[field],
            r.identity_correction && Object.hasOwn(r.identity_correction.after, field)
              ? r.identity_correction.before[field]
              : r.expected[field],
          );
        if (r.identity_correction) assert.equal(restored.visibility, 'draft');
      }
    } finally {
      await db.close();
    }
  });

test('anonymous reads reject privileged or invalid credentials', () => {
  const jwt = (role) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.doesNotThrow(() => assertPublishableKey('sb_publishable_example'));
  assert.doesNotThrow(() => assertPublishableKey(jwt('anon')));
  for (const key of ['sb_secret_example', jwt('service_role'), 'invalid'])
    assert.throws(() => assertPublishableKey(key), /Anonymous verification/);
});
