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
