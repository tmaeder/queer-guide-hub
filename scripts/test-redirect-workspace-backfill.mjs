import assert from 'node:assert/strict';
import { createRedirectTestDb } from './lib/redirect-test-db.mjs';
const legacy = '58aa4340-8f21-4b7f-9a10-90be2da89c01';
let before;
const db = await createRedirectTestDb({
  beforeMigration: async (store, suffix) => {
    if (suffix !== 'redirect_workspace_identity.sql') return;
    await store.exec(`
      INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000011');
      INSERT INTO public.user_roles VALUES('00000000-0000-4000-8000-000000000011','admin');
      INSERT INTO public.redirect_workspace_members(user_id,kind,label) VALUES('00000000-0000-4000-8000-000000000011','user','Existing account');
      INSERT INTO public.redirect_link_folders(id,name) VALUES('00000000-0000-4000-8000-000000000012','Existing folder');
      INSERT INTO public.redirect_link_tags(name) VALUES('Existing tag');
      INSERT INTO public.redirects(id,type,slug,target,created_by) VALUES('00000000-0000-4000-8000-000000000013','SHORT','before-identity','https://example.org/existing','00000000-0000-4000-8000-000000000011');
      INSERT INTO public.redirect_link_metadata(redirect_key,folder_id,comment) VALUES('redirects:00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000012','Keep this comment');
      INSERT INTO public.redirect_events(redirect_id,path,status) VALUES('00000000-0000-4000-8000-000000000013','/go/before-identity',302);
      INSERT INTO public.redirect_domains(hostname,created_by) VALUES('backfill-community.example.com','00000000-0000-4000-8000-000000000011');
    `);
    const { rows } = await store.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND(tablename LIKE 'redirect\\_%' ESCAPE '\\' OR tablename='redirects') ORDER BY tablename");
    before = new Map();
    for (const { tablename } of rows) {
      const result = await store.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS data FROM public."${tablename}" t`);
      before.set(tablename, result.rows[0].data);
    }
  },
});
try {
  assert.equal(before.size, 40);
  for (const [table, expected] of before) {
    const result = await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t)-'workspace_id' ORDER BY (to_jsonb(t)-'workspace_id')::text),'[]') AS data, count(*) FILTER(WHERE workspace_id<>$1 OR workspace_id IS NULL)::int AS wrong FROM public."${table}" t`, [legacy]);
    assert.equal(result.rows[0].wrong, 0, table + ' lost legacy identity');
    assert.deepEqual(result.rows[0].data, expected, table + ' changed existing data');
  }
  console.log('Workspace identity backfill: all40 resource tables retain every existing value and assign the same explicit legacy workspace. No production data was used.');
} finally {
  await db.close();
}
