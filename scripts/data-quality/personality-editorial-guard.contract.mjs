import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { compileBatch } from './personality-editorial-batch.mjs';
const { PGlite } = await import(
  process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
);
const migration = readFileSync(
  new URL(
    '../../supabase/migrations/99991795717424_personality_editorial_publication_guard.sql',
    import.meta.url,
  ),
  'utf8',
);
const id = '00000000-0000-0000-0000-000000000001';
const summary =
  'A writer whose published work explores the lives of queer people and their communities, providing documented cultural representation for readers.';
const details =
  'The publisher describes this writer’s book as a story about queer people and their lives. This is the connection through public cultural work.';
async function database() {
  const db = await PGlite.create();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA api_private;
    CREATE TABLE public.personalities(id uuid primary key default gen_random_uuid(),name text,slug text,visibility text default 'public',duplicate_of_id uuid,wikidata_qid text,birth_date date,description text,bio text,lgbti_details text,lgbti_connection text,profession text,pronouns text,view_count integer default 0,field_provenance jsonb default '{}',lgbti_connection_source text,updated_at timestamptz default now());
    CREATE TABLE public.personality_sources(id uuid primary key default gen_random_uuid(),personality_id uuid references public.personalities on delete cascade,source_slug text,source_entity_id text,source_url text,raw jsonb default '{}',confidence numeric,is_primary boolean,unique(source_slug,source_entity_id));
    CREATE TABLE public.personality_claim_sources(id uuid primary key default gen_random_uuid(),personality_id uuid references public.personalities on delete cascade,field_name text,source_id uuid references public.personality_sources on delete cascade,verification_status text default 'pending',checked_at timestamptz,confidence numeric);
    CREATE TABLE public.content_translations(id uuid primary key default gen_random_uuid(),table_name text,record_id uuid,field_name text,language text,value text,status text default 'draft',machine_source text,source_hash text,source_lang text,updated_at timestamptz default now(),unique(table_name,record_id,field_name,language));`);
  await db.query(
    `INSERT INTO personalities(id,name,slug,visibility,wikidata_qid,description,lgbti_details,lgbti_connection) VALUES($1,'Example Writer','example-writer','public','Q123',$2,$3,'representation')`,
    [id, summary, details],
  );
  const s = (
    await db.query(
      `INSERT INTO personality_sources(personality_id,source_slug,source_url,raw) VALUES($1,'editorial-batch-fixture','https://example.org/writer','{"identity_match":"exact","reviewer":"fixture-review","source_title":"Original publisher biography","reviewed_basis":"The publisher identifies this exact writer and the queer themes of the work.","connection_basis":"cultural_work"}') RETURNING id`,
      [id],
    )
  ).rows[0].id;
  for (const f of ['description', 'lgbti_details', 'lgbti_connection'])
    await db.query(
      `INSERT INTO personality_claim_sources(personality_id,field_name,source_id,verification_status,checked_at) VALUES($1,$2,$3,'verified',now())`,
      [id, f, s],
    );
  await db.exec(migration);
  await db.exec(
    readFileSync(
      new URL(
        '../../supabase/migrations/99991795724226_personality_reject_generic_biographies.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  return db;
}
async function approve(db, target, field, value, language = 'en') {
  const s = (
    await db.query(
      `INSERT INTO personality_sources(personality_id,source_slug,source_url,raw) VALUES($1,'editorial-batch-new','https://example.org/review','{"identity_match":"exact","reviewer":"new-review","source_title":"Reviewed publisher biography","reviewed_basis":"The biography identifies this exact writer and the supported public work.","connection_basis":"cultural_work"}') RETURNING id`,
      [target],
    )
  ).rows[0].id;
  await db.query(
    `INSERT INTO personality_claim_sources(personality_id,field_name,source_id,verification_status,checked_at,verified_value,verified_identity,verified_source_url,verified_language,reviewed_by)
    SELECT p.id,$2,$3,'verified',now(),$4,api_private.personality_editorial_identity(to_jsonb(p)),'https://example.org/review',$5,'new-review' FROM personalities p WHERE p.id=$1`,
    [target, field, s, value, language],
  );
}
async function rollbackAfter(db, fn) {
  await db.exec('BEGIN');
  try {
    return await fn();
  } finally {
    await db.exec('ROLLBACK');
  }
}
test('approval metadata cannot publish a generic biography; specific career facts remain publishable', async () => {
  const db = await database();
  try {
    for (const text of [
      'Example is a notable figure in the LGBTQ community, known for visibility and acceptance.',
      'Example is a notable figure in the LGBTQIA+ community.',
    ])
      await assert.rejects(
        rollbackAfter(db, async () => {
          await approve(db, id, 'bio', text);
          await db.query('UPDATE personalities SET bio=$1 WHERE id=$2', [text, id]);
          await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
        }),
        /Replace generic biography/,
      );
    await rollbackAfter(db, async () => {
      const text = 'The writer published a collection of stories about queer communities in 2020.';
      await approve(db, id, 'bio', text);
      await db.query('UPDATE personalities SET bio=$1 WHERE id=$2', [text, id]);
      await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
    });
    await rollbackAfter(db, async () => {
      await db.query(
        "UPDATE personalities SET visibility='draft',bio='A notable figure in the LGBTQ community.' WHERE id=$1",
        [id],
      );
      await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
      await assert.rejects(
        db.query("UPDATE personalities SET visibility='public' WHERE id=$1", [id]),
        /Replace generic biography/,
      );
    });
  } finally {
    await db.close();
  }
});
test('new personalities default to draft; missing explanations cannot be published', async () => {
  const db = await database();
  try {
    const row = (
      await db.query(
        `INSERT INTO personalities(name) VALUES('Draft proposal') RETURNING visibility`,
      )
    ).rows[0];
    assert.equal(row.visibility, 'draft');
    await assert.rejects(
      rollbackAfter(db, async () => {
        await db.query(
          `INSERT INTO personalities(name,visibility,description) VALUES('Bad public proposal','public',$1)`,
          [summary],
        );
        await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
      }),
      /community explanation/,
    );
  } finally {
    await db.close();
  }
});
test('stale text and identity swaps are rejected; unrelated view counts remain writable', async () => {
  const db = await database();
  try {
    await db.exec('UPDATE personalities SET view_count=view_count+1');
    assert.equal((await db.query('select view_count from personalities')).rows[0].view_count, 1);
    for (const sql of [
      "UPDATE personalities SET lgbti_details='A different unsupported explanation that has enough characters to look complete but has never been reviewed.'",
      "UPDATE personalities SET name='Different Person',wikidata_qid='Q456'",
    ])
      await assert.rejects(
        rollbackAfter(db, async () => {
          await db.exec(sql);
          await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
        }),
        /current verified evidence/,
      );
    assert.equal(
      (
        await db.query(
          `select details from api_private.personality_public_editorial(ARRAY[$1::uuid],'en')`,
          [id],
        )
      ).rows[0].details,
      details,
    );
  } finally {
    await db.close();
  }
});
test('reviewed replacement evidence and text may be written in either transaction order', async () => {
  const db = await database();
  try {
    for (const first of ['evidence', 'text'])
      await rollbackAfter(db, async () => {
        const value = details + ' The revised edition is covered by a new source review.';
        if (first === 'evidence') await approve(db, id, 'lgbti_details', value);
        await db.query('UPDATE personalities SET lgbti_details=$1', [value]);
        if (first === 'text') await approve(db, id, 'lgbti_details', value);
        await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
        assert.equal(
          (
            await db.query(
              `select details from api_private.personality_public_editorial(ARRAY[$1::uuid],'en')`,
              [id],
            )
          ).rows[0].details,
          value,
        );
      });
  } finally {
    await db.close();
  }
});
test('verified claims require an explicit reviewer, exact identity and English language review', async () => {
  const db = await database();
  try {
    await assert.rejects(
      rollbackAfter(db, () => approve(db, id, 'description', summary, 'de')),
      /reviewed value, language and reviewer/,
    );
    await assert.rejects(
      rollbackAfter(db, () => approve(db, id, 'description', summary.replace('writer', 'writеr'))),
      /reviewed value, language and reviewer/,
    );
    await assert.rejects(
      rollbackAfter(db, async () => {
        await db.exec(
          "UPDATE personality_claim_sources SET reviewed_by=NULL WHERE field_name='description'",
        );
      }),
      /reviewed value, language and reviewer/,
    );
    await assert.rejects(
      rollbackAfter(db, async () => {
        await db.exec(
          "UPDATE personality_claim_sources SET field_name='bio',verification_status='pending' WHERE field_name='description'",
        );
      }),
      /separate reviewed replacement evidence/,
    );
  } finally {
    await db.close();
  }
});
test('service-role automation cannot self-approve personality evidence or publish translations', async () => {
  const db = await database();
  try {
    await assert.rejects(
      rollbackAfter(db, async () => {
        await db.exec(`SET LOCAL "request.jwt.claims"='{"role":"service_role"}'`);
        await approve(db, id, 'description', summary);
      }),
      /Automated services must submit pending/,
    );
    await assert.rejects(
      rollbackAfter(db, async () => {
        await db.exec(`SET LOCAL "request.jwt.claims"='{"role":"service_role"}'`);
        await db.query(
          `INSERT INTO content_translations(table_name,record_id,field_name,language,value,status) VALUES('personalities',$1,'description','de','Ein automatisch erzeugter Übersetzungsvorschlag.','published')`,
          [id],
        );
      }),
      /Automated services must submit draft/,
    );
    await rollbackAfter(db, async () => {
      await db.exec(`SET LOCAL "request.jwt.claims"='{"role":"service_role"}'`);
      await db.query(
        `INSERT INTO content_translations(table_name,record_id,field_name,language,value,status) VALUES('personalities',$1,'description','de','Ein automatisch erzeugter Übersetzungsvorschlag.','draft')`,
        [id],
      );
      assert.equal(
        (await db.query('select status from content_translations')).rows[0].status,
        'draft',
      );
    });
  } finally {
    await db.close();
  }
});
test('restoring old text, identity or source URLs cannot reactivate superseded approvals', async () => {
  const db = await database();
  try {
    for (const mutation of [
      `UPDATE personalities SET lgbti_details='A changed explanation that remains a draft'; UPDATE personalities SET lgbti_details=${"'" + details.replaceAll("'", "''") + "'"}`,
      `UPDATE personalities SET name='Different Person'; UPDATE personalities SET name='Example Writer'`,
      `UPDATE personality_sources SET source_url='https://example.org/changed'; UPDATE personality_sources SET source_url='https://example.org/writer'`,
    ])
      await assert.rejects(
        rollbackAfter(db, async () => {
          await db.exec("UPDATE personalities SET visibility='draft'");
          await db.exec(mutation);
          assert.ok(
            (
              await db.query(
                "select count(*)::int n from personality_claim_sources where verification_status='pending'",
              )
            ).rows[0].n > 0,
          );
          await db.exec(
            "UPDATE personalities SET visibility='public'; SET CONSTRAINTS ALL IMMEDIATE",
          );
        }),
        /verified evidence|Draft the personality/,
      );
  } finally {
    await db.close();
  }
});
test('revoking evidence or changing its URL requires replacement proof or a draft profile', async () => {
  const db = await database();
  try {
    for (const sql of [
      "DELETE FROM personality_claim_sources WHERE field_name='lgbti_details'",
      "UPDATE personality_sources SET source_url='https://example.org/other-person'",
    ])
      await assert.rejects(
        rollbackAfter(db, async () => {
          await db.exec(sql);
          await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
        }),
        /Draft the personality/,
      );
    await rollbackAfter(db, async () => {
      await db.exec(
        "UPDATE personalities SET visibility='draft'; DELETE FROM personality_claim_sources",
      );
      await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
      assert.equal(
        (
          await db.query(
            `select * from api_private.personality_public_editorial(ARRAY[$1::uuid],'en')`,
            [id],
          )
        ).rows.length,
        0,
      );
    });
  } finally {
    await db.close();
  }
});
test('published translations need a current source snapshot and review; canonical edits draft old translations', async () => {
  const db = await database();
  const translated =
    'Das Werk erzählt vom Leben queerer Menschen und ihren Gemeinschaften. Diese Darstellung begründet die kulturelle Verbindung zur LGBTQ-Community.';
  try {
    await assert.rejects(
      db.query(
        `INSERT INTO content_translations(table_name,record_id,field_name,language,value,status) VALUES('personalities',$1,'lgbti_details','de',$2,'published')`,
        [id, translated],
      ),
      /translation must be reviewed/,
    );
    await db.query(
      `INSERT INTO content_translations(table_name,record_id,field_name,language,value,status,source_hash,source_lang,editorial_reviewed_by,editorial_reviewed_at,editorial_reviewed_value,editorial_reviewed_identity)
      SELECT 'personalities',p.id,'lgbti_details','de',$2,'published',md5($3),'en','language-review',now(),$2,api_private.personality_editorial_identity(to_jsonb(p)) FROM personalities p WHERE p.id=$1`,
      [id, translated, details],
    );
    await assert.rejects(
      db.query(`UPDATE content_translations SET value=$1`, [details]),
      /translation must be reviewed/,
    );
    await assert.rejects(
      db.query(`UPDATE content_translations SET value=value||' Ungeprüfter Zusatz.'`),
      /translation must be reviewed/,
    );
    const changed = details + ' A reviewed addition clarifies the scope.';
    await db.exec('BEGIN');
    await approve(db, id, 'lgbti_details', changed);
    await db.query('UPDATE personalities SET lgbti_details=$1', [changed]);
    await db.exec('COMMIT');
    assert.equal(
      (await db.query('select status from content_translations')).rows[0].status,
      'draft',
    );
    assert.deepEqual(
      (
        await db.query(
          `select translations from api_private.personality_public_editorial(ARRAY[$1::uuid],'de')`,
          [id],
        )
      ).rows[0].translations,
      {},
    );
  } finally {
    await db.close();
  }
});
test('policy-v2 compiler applies and restores approved translation snapshots under the real publication guards', async () => {
  const db = await database();
  try {
    await db.query(
      `INSERT INTO content_translations(table_name,record_id,field_name,language,value,status,source_hash,source_lang,editorial_reviewed_by,editorial_reviewed_at,editorial_reviewed_value,editorial_reviewed_identity)
      SELECT 'personalities',p.id,'lgbti_details','de',$2,'published',md5(p.lgbti_details),'en','prior-review',now(),$2,api_private.personality_editorial_identity(to_jsonb(p)) FROM personalities p WHERE p.id=$1`,
      [
        id,
        'Der Verlag beschreibt das Buch als Geschichte über queere Menschen und ihr Leben. Dies belegt eine Verbindung durch das kulturelle Werk.',
      ],
    );
    const snapshotQuery = `select to_jsonb(t)-ARRAY['id','table_name','record_id','field_name','language','updated_at'] snapshot from content_translations t`;
    const before = (await db.query(snapshotQuery)).rows[0].snapshot;
    const batch = {
      schema_version: 1,
      editorial_policy_version: 2,
      id: 'guard-compiler-contract',
      reviewer: 'guard-review',
      reviewed_at: '2026-01-01T00:00:00Z',
      records: [
        {
          id,
          name: 'Example Writer',
          slug: 'example-writer',
          expected_identity: {
            name: 'Example Writer',
            slug: 'example-writer',
            wikidata_qid: 'Q123',
            birth_date: null,
          },
          expected: {
            description: summary,
            lgbti_details: details,
            lgbti_connection: 'representation',
          },
          metadata_before: { field_provenance: {}, lgbti_connection_source: null },
          changes: {
            description: summary + ' The publisher confirms these themes.',
            lgbti_details: details + ' A new source review confirms the revised edition.',
            lgbti_connection: 'representation',
          },
          sources: [
            {
              url: 'https://example.org/revised-edition',
              title: 'Publisher review',
              checked_at: '2026-01-01T00:00:00Z',
              identity_match: 'exact',
              basis:
                'The publisher identifies the exact writer and the queer themes of the revised book.',
              fields: ['description', 'lgbti_details', 'lgbti_connection'],
            },
          ],
          translations: {
            de: {
              description:
                'Die Schriftstellerin zeigt in ihren Werken das Leben queerer Menschen und ihrer Gemeinschaften und schafft damit kulturelle Repräsentation.',
              lgbti_details:
                'Der Verlag beschreibt das Buch als Geschichte über queere Menschen und ihr Leben. Eine neue Quellenprüfung bestätigt die überarbeitete Ausgabe.',
            },
          },
          expected_translations: { de: { description: null, lgbti_details: before } },
          review: {
            status: 'reviewed',
            connection_basis: 'cultural_work',
            translation_languages: ['de'],
          },
        },
      ],
    };
    const compiled = compileBatch(batch);
    await db.exec(compiled.apply);
    assert.equal(
      (
        await db.query(
          `select details from api_private.personality_public_editorial(ARRAY[$1::uuid],'en')`,
          [id],
        )
      ).rows[0].details,
      batch.records[0].changes.lgbti_details,
    );
    await db.exec(
      "UPDATE content_translations SET editorial_reviewed_by='later-review' WHERE field_name='lgbti_details'",
    );
    await assert.rejects(db.exec(compiled.rollback), /Later edit protects translation/);
    await db.exec(
      "UPDATE content_translations SET editorial_reviewed_by='guard-review' WHERE field_name='lgbti_details'",
    );
    await db.exec(compiled.rollback);
    assert.equal(
      (await db.query('select lgbti_details from personalities')).rows[0].lgbti_details,
      details,
    );
    const after = (await db.query(snapshotQuery)).rows[0].snapshot;
    assert.deepEqual(after, before);
  } finally {
    await db.close();
  }
});

function correctedIdentityBatch() {
  const before = {
    name: 'Example Writer',
    slug: 'example-writer',
    wikidata_qid: 'Q123',
    birth_date: null,
    description: summary,
    bio: null,
    lgbti_details: details,
    lgbti_connection: 'representation',
    profession: null,
    pronouns: null,
    field_provenance: {},
    lgbti_connection_source: null,
    image_url: 'https://example.org/wrong-person.jpg',
    image_status: 'available',
    is_living: false,
  };
  const changes = {
    description: summary,
    bio: 'The writer published a collection of stories about queer communities and the people who shape their cultural life.',
    lgbti_details: details,
    lgbti_connection: 'representation',
  };
  return {
    schema_version: 1,
    editorial_policy_version: 2,
    id: 'corrected-identity-contract',
    reviewer: 'identity-review',
    reviewed_at: '2026-01-01T00:00:00Z',
    records: [
      {
        id,
        name: 'Example Writer',
        slug: 'example-writer',
        expected_identity: {
          name: 'Example Writer',
          slug: 'example-writer',
          wikidata_qid: null,
          birth_date: null,
        },
        expected: {
          description: summary,
          bio: null,
          lgbti_details: details,
          lgbti_connection: 'representation',
        },
        metadata_before: { field_provenance: {}, lgbti_connection_source: null },
        changes,
        identity_correction: {
          before,
          after: { wikidata_qid: null, image_url: null, image_status: 'rejected', is_living: null },
          evidence: {
            status: 'reviewed',
            reason:
              'The publisher identifies this exact writer; the old identifier and photograph belonged to a different namesake and have been rejected.',
            urls: ['https://example.org/reviewed-writer'],
          },
        },
        sources: [
          {
            url: 'https://example.org/reviewed-writer',
            title: 'Publisher author biography',
            checked_at: '2026-01-01T00:00:00Z',
            identity_match: 'exact',
            basis:
              'The author biography identifies the exact writer and the published collection about queer communities.',
            fields: Object.keys(changes),
          },
        ],
        translations: {
          de: {
            description:
              'Das literarische Werk erzählt vom Leben queerer Menschen und ihren Gemeinschaften und schafft damit eine belegte Verbindung zur LGBTQ-Kultur.',
            bio: 'Die schriftstellerische Arbeit umfasst eine Sammlung von Erzählungen über queere Gemeinschaften und die Menschen, die deren kulturelles Leben prägen.',
            lgbti_details:
              'Der Verlag beschreibt die Sammlung als Erzählungen über queere Menschen und ihre Gemeinschaften. Dieses veröffentlichte Werk begründet die kulturelle Verbindung.',
          },
        },
        expected_translations: { de: { description: null, bio: null, lgbti_details: null } },
        review: {
          status: 'reviewed',
          connection_basis: 'cultural_work',
          translation_languages: ['de'],
        },
      },
    ],
  };
}
async function identityDatabase() {
  const db = await database();
  await db.exec(
    "ALTER TABLE personalities ADD COLUMN death_date date,ADD COLUMN is_living boolean DEFAULT false,ADD COLUMN image_url text DEFAULT 'https://example.org/wrong-person.jpg',ADD COLUMN image_status text DEFAULT 'available',ADD COLUMN nationality text,ADD COLUMN wikipedia_url text,ADD COLUMN profile_url text,ADD COLUMN birth_place text,ADD COLUMN death_place text,ADD COLUMN cause_of_death text,ADD COLUMN tags text[];",
  );
  return db;
}
test('identity corrections replace wrong bindings atomically; rollback leaves the profile in draft', async () => {
  const db = await identityDatabase();
  try {
    const batch = correctedIdentityBatch();
    const sql = compileBatch(batch);
    await db.exec(`BEGIN;${sql.apply} SET CONSTRAINTS ALL IMMEDIATE; COMMIT;`);
    assert.deepEqual(
      (await db.query('select wikidata_qid,image_url,image_status,visibility from personalities'))
        .rows[0],
      { wikidata_qid: null, image_url: null, image_status: 'rejected', visibility: 'public' },
    );
    await db.exec(`BEGIN;${sql.rollback} SET CONSTRAINTS ALL IMMEDIATE; COMMIT;`);
    assert.deepEqual(
      (await db.query('select wikidata_qid,image_url,visibility from personalities')).rows[0],
      {
        wikidata_qid: 'Q123',
        image_url: 'https://example.org/wrong-person.jpg',
        visibility: 'draft',
      },
    );
  } finally {
    await db.close();
  }
});
test('a concurrent portrait or identity edit aborts the entire correction before publication', async () => {
  const db = await identityDatabase();
  try {
    await db.exec("UPDATE personalities SET image_url='https://example.org/new-review.jpg'");
    await assert.rejects(
      rollbackAfter(db, () => db.exec(compileBatch(correctedIdentityBatch()).apply)),
      /Identity correction snapshot changed/,
    );
    assert.equal(
      (await db.query('select wikidata_qid from personalities')).rows[0].wikidata_qid,
      'Q123',
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from personality_sources where source_slug='editorial-batch-corrected-identity-contract'",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
test('later identity metadata edits block rollback and preserve the published correction', async () => {
  const db = await identityDatabase();
  try {
    const sql = compileBatch(correctedIdentityBatch());
    await db.exec(`BEGIN;${sql.apply} SET CONSTRAINTS ALL IMMEDIATE; COMMIT;`);
    await db.exec("UPDATE personalities SET image_status='needs_review'");
    await assert.rejects(
      rollbackAfter(db, () => db.exec(sql.rollback)),
      /Later identity edit protects profile/,
    );
    assert.equal(
      (await db.query('select visibility from personalities')).rows[0].visibility,
      'public',
    );
  } finally {
    await db.close();
  }
});
test('identity corrections cannot reuse an unreviewed biography or introduce arbitrary metadata', () => {
  const batch = correctedIdentityBatch();
  delete batch.records[0].changes.bio;
  assert.throws(() => compileBatch(batch), /replacement biography/);
  const malicious = correctedIdentityBatch();
  malicious.records[0].identity_correction.after.visibility = 'draft';
  assert.throws(() => compileBatch(malicious), /Unsupported identity correction/);
});
test('name and date corrections draft old translations, replace them with reviewed text, and roll back privately', async () => {
  const db = await identityDatabase();
  try {
    const batch = correctedIdentityBatch(),
      r = batch.records[0];
    r.name = r.expected_identity.name = 'Correct Writer';
    r.expected_identity.birth_date = '1980-04-25';
    Object.assign(r.identity_correction.after, { name: r.name, birth_date: '1980-04-25' });
    await db.query(
      `INSERT INTO content_translations(table_name,record_id,field_name,language,value,status,source_hash,source_lang,editorial_reviewed_by,editorial_reviewed_at,editorial_reviewed_value,editorial_reviewed_identity)
      SELECT 'personalities',id,'description','de',$1,'published',md5(description),'en','original-review',now(),$1,api_private.personality_editorial_identity(to_jsonb(p)) FROM personalities p`,
      [r.translations.de.description],
    );
    r.expected_translations.de.description = (
      await db.query(
        "SELECT to_jsonb(t)-ARRAY['id','table_name','record_id','field_name','language','updated_at'] snapshot FROM content_translations t",
      )
    ).rows[0].snapshot;
    const sql = compileBatch(batch);
    await db.exec(`BEGIN;${sql.apply} SET CONSTRAINTS ALL IMMEDIATE; COMMIT;`);
    const p = (await db.query('SELECT name,birth_date::text FROM personalities')).rows[0];
    assert.deepEqual(p, { name: 'Correct Writer', birth_date: '1980-04-25' });
    assert.equal(
      (await db.query("SELECT status FROM content_translations WHERE field_name='description'"))
        .rows[0].status,
      'published',
    );
    await db.exec(`BEGIN;${sql.rollback} SET CONSTRAINTS ALL IMMEDIATE; COMMIT;`);
    assert.equal(
      (await db.query('SELECT visibility FROM personalities')).rows[0].visibility,
      'draft',
    );
    assert.equal(
      (await db.query("SELECT status FROM content_translations WHERE field_name='description'"))
        .rows[0].status,
      'draft',
    );
  } finally {
    await db.close();
  }
});

async function heldReviewFixture() {
  const db = await identityDatabase();
  await db.exec(
    'ALTER TABLE personalities ADD COLUMN needs_attention boolean,ADD COLUMN seo_indexable boolean',
  );
  const heldId = '00000000-0000-0000-0000-000000000002';
  // Model a legacy public import that predates the publication guard.
  await db.exec(`ALTER TABLE personalities DISABLE TRIGGER USER;
    INSERT INTO personalities(id,name,slug,visibility,wikidata_qid,description,bio,needs_attention,seo_indexable) VALUES('${heldId}','Unverified Namesake','unverified-namesake','public','Q999','Legacy imported summary','Unverified imported biography',false,true);
    ALTER TABLE personalities ENABLE TRIGGER USER;`);
  const before = (
    await db.query(
      'select id,name,slug,wikidata_qid,birth_date,description,bio,lgbti_details,lgbti_connection,profession,pronouns,visibility,duplicate_of_id,field_provenance,lgbti_connection_source,needs_attention,seo_indexable from personalities where id=$1',
      [heldId],
    )
  ).rows[0];
  const batch = correctedIdentityBatch();
  batch.review_holds = [
    {
      id: heldId,
      name: before.name,
      slug: before.slug,
      before,
      status: 'needs_source_review',
      reason:
        'The imported identifier belongs to an unrelated namesake. The checked individual biography does not establish a documented LGBTQ connection for this exact imported person; keep private until new evidence is reviewed.',
      checked_sources: [
        {
          url: 'https://example.org/namesake',
          finding:
            'The individual biography identifies a different professional and does not support the imported identity or community connection.',
        },
      ],
    },
  ];
  return { db, batch, heldId };
}
test('source-review holds publish atomically with the reviewed batch and remain private after rollback', async () => {
  const { db, batch, heldId } = await heldReviewFixture();
  try {
    const sql = compileBatch(batch);
    await db.exec(`BEGIN;${sql.apply} SET CONSTRAINTS ALL IMMEDIATE; COMMIT;`);
    const held = (
      await db.query(
        'select visibility,needs_attention,seo_indexable,field_provenance from personalities where id=$1',
        [heldId],
      )
    ).rows[0];
    assert.equal(held.visibility, 'draft');
    assert.equal(held.needs_attention, true);
    assert.equal(held.seo_indexable, false);
    assert.equal(held.field_provenance.editorial_hold.reason, batch.review_holds[0].reason);
    await assert.rejects(
      db.exec(
        `BEGIN;UPDATE personalities SET visibility='public' WHERE id='${heldId}';SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`,
      ),
      /review|verified|publication|explanation/i,
    );
    await db.exec('ROLLBACK');
    await db.exec(`BEGIN;${sql.rollback} SET CONSTRAINTS ALL IMMEDIATE; COMMIT;`);
    assert.equal(
      (await db.query('select visibility from personalities where id=$1', [heldId])).rows[0]
        .visibility,
      'draft',
    );
  } finally {
    await db.close();
  }
});
test('a later hold edit aborts all publication without hiding the edited row', async () => {
  const { db, batch, heldId } = await heldReviewFixture();
  try {
    await db.query('UPDATE personalities SET seo_indexable=false WHERE id=$1', [heldId]);
    await assert.rejects(db.exec(compileBatch(batch).apply), /Review hold snapshot changed/);
    assert.equal(
      (await db.query('select visibility from personalities where id=$1', [heldId])).rows[0]
        .visibility,
      'public',
    );
    assert.equal(
      (await db.query('select wikidata_qid from personalities where id=$1', [id])).rows[0]
        .wikidata_qid,
      'Q123',
    );
  } finally {
    await db.close();
  }
});
test('holds reject missing research, incomplete snapshots and overlap with reviewed identities', async () => {
  const { db, batch } = await heldReviewFixture();
  try {
    for (const edit of [
      (b) => delete b.review_holds[0].before.bio,
      (b) => (b.review_holds[0].checked_sources = []),
      (b) => (b.review_holds[0].id = b.records[0].id),
      (b) => (b.review_holds[0].reason = 'Unclear'),
    ]) {
      const invalid = structuredClone(batch);
      edit(invalid);
      assert.throws(() => compileBatch(invalid));
    }
  } finally {
    await db.close();
  }
});

async function releaseFixture(correctIdentity = true) {
  const db = await identityDatabase();
  await db.exec(`ALTER TABLE personalities ADD COLUMN needs_attention boolean,ADD COLUMN seo_indexable boolean;
    UPDATE personalities SET visibility='draft',needs_attention=true,seo_indexable=false,
      description='Legacy imported summary',bio='A notable figure in the LGBTQ community',lgbti_details=NULL,
      field_provenance='{"editorial_hold":{"reason":"Unverified imported identity","batch_id":"original-hold"}}';`);
  const before = (await db.query('SELECT * FROM personalities WHERE id=$1', [id])).rows[0];
  delete before.updated_at;
  const batch = correctedIdentityBatch(),
    r = batch.records[0];
  batch.id = correctIdentity ? 'held-release-identity-contract' : 'held-release-contract';
  r.expected = Object.fromEntries(Object.keys(r.changes).map((f) => [f, before[f]]));
  r.metadata_before = {
    field_provenance: before.field_provenance,
    lgbti_connection_source: before.lgbti_connection_source,
  };
  if (correctIdentity) r.identity_correction.before = before;
  else {
    delete r.identity_correction;
    r.expected_identity.wikidata_qid = before.wikidata_qid;
  }
  r.review_hold_release = {
    before,
    evidence: {
      status: 'reviewed',
      reason:
        'The original publisher now establishes this exact writer and a specific published queer cultural work. Replace the unsupported imported biography before publication.',
      urls: [r.sources[0].url],
    },
  };
  return { db, batch, before };
}
test('held releases publish only after complete reviewed replacements; both rollback paths restore private holds', async () => {
  for (const correctIdentity of [false, true]) {
    const { db, batch, before } = await releaseFixture(correctIdentity);
    try {
      await assert.rejects(
        rollbackAfter(db, () =>
          db.exec(`UPDATE personalities SET visibility='public';SET CONSTRAINTS ALL IMMEDIATE;`),
        ),
        /generic|review|verified|publication|explanation/i,
      );
      const sql = compileBatch(batch);
      await db.exec(`BEGIN;${sql.apply} SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`);
      const p = (await db.query('SELECT * FROM personalities WHERE id=$1', [id])).rows[0];
      assert.equal(p.visibility, 'public');
      assert.equal(p.needs_attention, false);
      assert.equal(p.seo_indexable, true);
      assert.equal(p.field_provenance.editorial_hold, undefined);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM content_translations WHERE status='published'",
          )
        ).rows[0].n,
        3,
      );
      await db.exec(`BEGIN;${sql.rollback} SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`);
      const old = (await db.query('SELECT * FROM personalities WHERE id=$1', [id])).rows[0];
      assert.equal(old.visibility, 'draft');
      assert.equal(old.needs_attention, true);
      assert.equal(old.seo_indexable, false);
      assert.equal(old.bio, before.bio);
      assert.deepEqual(old.field_provenance.editorial_hold, before.field_provenance.editorial_hold);
    } finally {
      await db.close();
    }
  }
});
test('stale hold metadata aborts release and later publication edits block rollback', async () => {
  const { db, batch } = await releaseFixture();
  try {
    const sql = compileBatch(batch);
    await db.query(
      "UPDATE personalities SET field_provenance=jsonb_set(field_provenance,'{editorial_hold,reason}','\"New reviewer decision\"') WHERE id=$1",
      [id],
    );
    await assert.rejects(
      rollbackAfter(db, () => db.exec(sql.apply)),
      /Held-release snapshot changed/,
    );
    await db.query('UPDATE personalities SET field_provenance=$1::jsonb WHERE id=$2', [
      JSON.stringify(batch.records[0].metadata_before.field_provenance),
      id,
    ]);
    await db.exec(`BEGIN;${sql.apply} SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`);
    await db.query('UPDATE personalities SET seo_indexable=false WHERE id=$1', [id]);
    await assert.rejects(
      rollbackAfter(db, () => db.exec(sql.rollback)),
      /Later publication edit protects/,
    );
    assert.equal(
      (await db.query('SELECT visibility FROM personalities')).rows[0].visibility,
      'public',
    );
  } finally {
    await db.close();
  }
});
test('release validation rejects incomplete text, missing hold, identity drift and unrelated evidence', async () => {
  const { db, batch } = await releaseFixture();
  try {
    for (const mutate of [
      (r) => delete r.translations.de.bio,
      (r) => delete r.review_hold_release.before.field_provenance.editorial_hold,
      (r) => (r.review_hold_release.before.wikidata_qid = 'Q999'),
      (r) => (r.review_hold_release.evidence.urls = ['https://example.org/unreviewed']),
    ]) {
      const copy = JSON.parse(JSON.stringify(batch));
      mutate(copy.records[0]);
      assert.throws(() => compileBatch(copy), /Release|release|hold|snapshot|biography/i);
    }
  } finally {
    await db.close();
  }
});
test('a continued private hold records new research without making the record public', async () => {
  const { db, batch, heldId } = await heldReviewFixture();
  try {
    const first = compileBatch(batch);
    await db.exec(first.apply);
    const held = (await db.query('SELECT * FROM personalities WHERE id=$1', [heldId])).rows[0];
    const continued = structuredClone(batch);
    continued.id = 'continued-private-research';
    const h = continued.review_holds[0];
    h.before = Object.fromEntries(Object.keys(h.before).map((f) => [f, held[f]]));
    h.reason +=
      ' Newly read original material identifies the same namesake conflict and supplies no evidence that would justify publication.';
    // This test isolates the hold prelude; the reviewed companion record has already been published.
    const { reviewHoldPrelude, validateReviewHolds } =
      await import('./personality-review-holds.mjs');
    validateReviewHolds(continued);
    const literal = (v) => "'" + String(v).replaceAll("'", "''") + "'";
    const prelude = reviewHoldPrelude(
      continued,
      literal,
      (v) => literal(JSON.stringify(v)) + '::jsonb',
    );
    await db.exec(`DO $$ DECLARE r jsonb;p personalities%ROWTYPE;f text;BEGIN ${prelude} END $$;`);
    const updated = (await db.query('SELECT * FROM personalities WHERE id=$1', [heldId])).rows[0];
    assert.equal(updated.visibility, 'draft');
    assert.equal(updated.field_provenance.editorial_hold.reason, h.reason);
  } finally {
    await db.close();
  }
});

if (process.env.PERSONALITY_BATCH_MANIFEST)
  test('the actual held batch passes production publication guards and restores private originals', async () => {
    const batch = JSON.parse(readFileSync(process.env.PERSONALITY_BATCH_MANIFEST, 'utf8'));
    if (!batch.records.some((r) => r.review_hold_release)) return;
    const db = await identityDatabase();
    try {
      await db.exec(
        'ALTER TABLE personalities ADD COLUMN needs_attention boolean,ADD COLUMN seo_indexable boolean;DELETE FROM personalities;',
      );
      for (const before of [
        ...batch.records.map((r) => r.review_hold_release.before),
        ...batch.review_holds.map((h) => h.before),
      ])
        await db.query(
          'INSERT INTO personalities SELECT (jsonb_populate_record(NULL::personalities,$1::jsonb)).*',
          [JSON.stringify(before)],
        );
      const sql = compileBatch(batch);
      await db.exec(`BEGIN;${sql.apply} SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`);
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM personalities WHERE visibility='public'"))
          .rows[0].n,
        batch.records.length,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM content_translations WHERE status='published'",
          )
        ).rows[0].n,
        batch.records.reduce((n, r) => n + Object.keys(r.translations.de).length, 0),
      );
      await db.exec(`BEGIN;${sql.rollback} SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`);
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM personalities WHERE visibility='public'"))
          .rows[0].n,
        0,
      );
      for (const r of batch.records) {
        const old = (await db.query('SELECT * FROM personalities WHERE id=$1', [r.id])).rows[0];
        assert.equal(old.bio, r.review_hold_release.before.bio);
        assert.deepEqual(
          old.field_provenance.editorial_hold,
          r.review_hold_release.before.field_provenance.editorial_hold,
        );
      }
    } finally {
      await db.close();
    }
  });

test('a production trigger cannot silently replace a reviewed release value', async () => {
  const { db, batch, before } = await releaseFixture(false);
  try {
    await db.exec(`CREATE FUNCTION normalize_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.description IS DISTINCT FROM OLD.description THEN NEW.description=NEW.description||' Normalized'; END IF;RETURN NEW;END $$;
      CREATE TRIGGER normalize_fixture BEFORE UPDATE ON personalities FOR EACH ROW EXECUTE FUNCTION normalize_fixture();`);
    await assert.rejects(
      rollbackAfter(db, () => db.exec(compileBatch(batch).apply)),
      /Production normalization differs from reviewed value/,
    );
    const p = (await db.query('SELECT * FROM personalities')).rows[0];
    assert.equal(p.visibility, 'draft');
    assert.equal(p.description, before.description);
  } finally {
    await db.close();
  }
});

test('unverified imported tags clear with release; concurrent and later tag edits are protected', async () => {
  const { db, batch, before } = await releaseFixture();
  try {
    before.tags = ['Unverified identity label'];
    batch.records[0].review_hold_release.clear_unverified_tags = true;
    await db.query('UPDATE personalities SET tags=$1 WHERE id=$2', [before.tags, id]);
    const sql = compileBatch(batch);
    await db.query('UPDATE personalities SET tags=$1 WHERE id=$2', [
      ['Concurrent reviewer tag'],
      id,
    ]);
    await assert.rejects(
      rollbackAfter(db, () => db.exec(sql.apply)),
      /Held-release snapshot changed/,
    );
    await db.query('UPDATE personalities SET tags=$1 WHERE id=$2', [before.tags, id]);
    await db.exec(`BEGIN;${sql.apply} SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`);
    assert.deepEqual((await db.query('SELECT tags FROM personalities')).rows[0].tags, []);
    await db.query('UPDATE personalities SET tags=$1 WHERE id=$2', [['Later reviewed tag'], id]);
    await assert.rejects(
      rollbackAfter(db, () => db.exec(sql.rollback)),
      /Later tag edit protects/,
    );
    await db.query('UPDATE personalities SET tags=$1 WHERE id=$2', [[], id]);
    await db.exec(`BEGIN;${sql.rollback} SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`);
    const p = (await db.query('SELECT visibility,tags FROM personalities')).rows[0];
    assert.equal(p.visibility, 'draft');
    assert.deepEqual(p.tags, before.tags);
  } finally {
    await db.close();
  }
});

test('strict publication rolls back the whole batch when the production quality gate silently demotes a release', async () => {
  const { db, batch } = await releaseFixture(true);
  try {
    batch.publication_assertions = 'strict';
    await db.exec(`ALTER TABLE personalities ADD COLUMN review_status text,ADD COLUMN wikidata_status text,ADD COLUMN is_adult boolean DEFAULT false,ADD COLUMN enrichment_status jsonb,ADD COLUMN quality_dimensions jsonb;
      CREATE TABLE image_assets(id uuid,status text,optimization_status text);
      CREATE TABLE image_asset_links(asset_id uuid,entity_type text,entity_id uuid,role text);`);
    const production = readFileSync(
      new URL(
        '../../supabase/migrations/99991790020000_personality_data_quality_contracts.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const start = production.indexOf(
      'create or replace function public.enforce_personality_public_gate()',
    );
    const end = production.indexOf(
      'revoke all on function public.enforce_personality_public_gate()',
      start,
    );
    await db.exec(production.slice(start, end));
    await db.exec(
      'CREATE TRIGGER production_quality_gate BEFORE UPDATE ON personalities FOR EACH ROW EXECUTE FUNCTION public.enforce_personality_public_gate()',
    );
    await assert.rejects(
      rollbackAfter(db, () => db.exec(compileBatch(batch).apply)),
      /Publication gate did not release reviewed profile/,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM personality_sources WHERE source_slug LIKE 'editorial-batch-held-release%'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query('SELECT visibility FROM personalities')).rows[0].visibility,
      'draft',
    );
  } finally {
    await db.close();
  }
});

test('anonymous translations and source metadata require a public nonduplicate parent; staff can review held records', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA api_private;
      CREATE TYPE public.app_role AS ENUM('admin','moderator');
      CREATE TABLE user_roles(user_id uuid,role app_role);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.test_uid',true),'')::uuid $$;
      CREATE FUNCTION api_private.has_any_role_jwt(roles app_role[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role=ANY(roles)) $$;
      CREATE TABLE personalities(id uuid,visibility text,duplicate_of_id uuid);
      CREATE TABLE content_translations(table_name text,record_id uuid,status text);
      CREATE TABLE personality_sources(personality_id uuid,source_url text);
      ALTER TABLE content_translations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE personality_sources ENABLE ROW LEVEL SECURITY;
      CREATE POLICY content_translations_select ON content_translations FOR SELECT USING(status='published');
      CREATE POLICY personality_sources_select_all ON personality_sources FOR SELECT USING(true);
      GRANT USAGE ON SCHEMA public,auth,api_private TO anon,authenticated;
      GRANT SELECT ON personalities,content_translations,personality_sources,user_roles TO anon,authenticated;
      INSERT INTO personalities VALUES('00000000-0000-0000-0000-000000000001','public',NULL),('00000000-0000-0000-0000-000000000002','draft',NULL),('00000000-0000-0000-0000-000000000003','public','00000000-0000-0000-0000-000000000001');
      INSERT INTO content_translations SELECT 'personalities',id,'published' FROM personalities;
      INSERT INTO content_translations VALUES('news_articles','00000000-0000-0000-0000-000000000002','published');
      INSERT INTO personality_sources SELECT id,'https://example.org/source' FROM personalities;
      INSERT INTO user_roles VALUES('00000000-0000-0000-0000-000000000099','moderator');`);
    await db.exec(
      readFileSync(
        new URL(
          '../../supabase/migrations/20261127060719_personality_private_translation_visibility.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec('SET ROLE anon');
    assert.equal((await db.query('SELECT count(*)::int n FROM content_translations')).rows[0].n, 2);
    assert.equal((await db.query('SELECT count(*)::int n FROM personality_sources')).rows[0].n, 1);
    await db.exec('RESET ROLE;SET ROLE authenticated');
    assert.equal((await db.query('SELECT count(*)::int n FROM content_translations')).rows[0].n, 2);
    assert.equal((await db.query('SELECT count(*)::int n FROM personality_sources')).rows[0].n, 1);
    await db.exec(
      "RESET ROLE;SET app.test_uid='00000000-0000-0000-0000-000000000099';SET ROLE authenticated",
    );
    assert.equal((await db.query('SELECT count(*)::int n FROM content_translations')).rows[0].n, 4);
    assert.equal((await db.query('SELECT count(*)::int n FROM personality_sources')).rows[0].n, 3);
    await db.exec(
      "RESET ROLE;SET app.test_uid='';UPDATE personalities SET visibility='public' WHERE id='00000000-0000-0000-0000-000000000002';SET ROLE anon",
    );
    assert.equal((await db.query('SELECT count(*)::int n FROM content_translations')).rows[0].n, 3);
    assert.equal((await db.query('SELECT count(*)::int n FROM personality_sources')).rows[0].n, 2);
  } finally {
    await db.close();
  }
});
