import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../..');
const configurationTables = [
  'admin_review_sources',
  'admin_review_finding_codes',
  'triage_sources',
  'review_field_registry',
];
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";

// Static paths are data, never evaluated JavaScript. Include regex URL fixtures
// too, e.g. waitForURL(/\/organizations\/supergayunderwear/).
export function collectFixtureSlugs(directory = join(repository, 'e2e')) {
  const slugs = new Set();
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        const text = readFileSync(path, 'utf8').replaceAll('\\/', '/');
        for (const match of text.matchAll(
          /\/(?:city|country|villages|venues|organizations|events|hotels|tags|news|guides|people|personalities)\/([a-z0-9][a-z0-9-]*)/gi,
        )) {
          slugs.add(match[1].toLowerCase());
        }
      }
    }
  }
  visit(directory);
  return [...slugs].sort();
}

export function manifestSql({
  maxBytes = 20_000_000,
  rowCap = 3000,
  slugs = collectFixtureSlugs(),
  fullTables = ['unified_tags'],
} = {}) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 0 ||
    !Number.isSafeInteger(rowCap) ||
    rowCap < 1
  ) {
    throw new Error('Snapshot limits must be non-negative bytes and a positive row cap');
  }
  if (!Array.isArray(fullTables) || fullTables.some((name) => !/^[a-z_][a-z_0-9]*$/.test(name)))
    throw new Error('Invalid full-table snapshot configuration');
  const configurationArray = 'ARRAY[' + configurationTables.map(literal).join(',') + ']::text[]';
  const fullArray =
    'ARRAY[' +
    [...new Set([...fullTables, ...configurationTables])].map(literal).join(',') +
    ']::text[]';
  const array = 'ARRAY[' + slugs.map(literal).join(',') + ']::text[]';
  const priority = ' order by case when slug = any(' + array + ') then 0 else 1 end, slug';
  // Keep complete public reference sets for safety charts, representative
  // commerce groups, and upcoming Pride events rather than alphabetic slices.
  const upcomingPride =
    "(event_type ilike '%pride%' or event_type ilike '%festival%') and start_date between now() and now()+interval '120 days' and duplicate_of_id is null";
  const eventPredicate = '(slug = any(' + array + ') or (' + upcomingPride + '))';
  const eventPriority = ' order by case when ' + eventPredicate + ' then 0 else 1 end, slug';
  const tagPriority =
    ' order by case when slug = any(' +
    array +
    ') or id in (' +
    'select tag_id from public.sti_profiles union select tag_a_id from public.substance_interactions union select tag_b_id from public.substance_interactions' +
    ') then 0 else 1 end, slug';
  const marketplacePriority =
    " order by case when status='active' and overview_eligible and content_rating in ('sfw','suggestive') then 0 else 1 end, " +
    'row_number() over(partition by subcategory_group,status,overview_eligible,content_rating order by id), id';
  // Preserve the city side of each sampled route/upcoming event breadcrumb.
  const cityPriority =
    ' order by case when slug = any(' +
    array +
    ') or id in (' +
    'select city_id from public.venues where slug = any(' +
    array +
    ') union ' +
    'select city_id from public.hotels where slug = any(' +
    array +
    ') union ' +
    'select city_id from public.events where ' +
    eventPredicate +
    ') then 0 else 1 end, slug';
  return [
    "select c.relname, string_agg(quote_ident(a.attname), ',' order by a.attnum),",
    'case when pg_table_size(c.oid) > ' +
      maxBytes +
      ' and c.relname <> all(' +
      fullArray +
      ') then',
    " (case when c.relname='cities' then " + literal(cityPriority),
    " when c.relname='unified_tags' then " + literal(tagPriority),
    " when c.relname='marketplace_listings' then " + literal(marketplacePriority),
    " when c.relname='events' then " + literal(eventPriority),
    " when bool_or(a.attname='slug') then " + literal(priority),
    " when bool_or(a.attname='id') then ' order by id' else '' end) || ' limit " + rowCap + "'",
    "else '' end",
    'from pg_class c join pg_namespace n on n.oid=c.relnamespace',
    "join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and a.attgenerated=''",
    "where n.nspname='public' and c.relkind='r' and (has_table_privilege('anon',c.oid,'SELECT') or c.relname = any(" +
      configurationArray +
      '))',
    'group by c.oid,c.relname order by c.relname;',
  ].join('\n');
}

export function assertLocalDatabase(value) {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Synthetic CI fixtures may only be seeded into a loopback database');
  }
}

export function snapshotCacheKey({
  day = new Date().toISOString().slice(0, 10),
  manifest = manifestSql(),
  snapshotScript = readFileSync(join(here, 'db-snapshot.sh'), 'utf8'),
  workflow = readFileSync(join(repository, '.github/workflows/db-snapshot.yml'), 'utf8'),
} = {}) {
  const digest = createHash('sha256')
    .update(JSON.stringify([manifest, snapshotScript, workflow]))
    .digest('hex');
  return 'db-snapshot-v2-' + day + '-' + digest;
}

export function adminSeedSql() {
  // Configuration only: these source definitions and finding-code mappings
  // are already code in migrations. No production review records are copied.
  const configuration = JSON.parse(readFileSync(join(here, 'review-configuration.json'), 'utf8'));
  return [
    'begin;',
    "set local session_replication_role='replica';",
    'insert into public.admin_review_sources select * from jsonb_populate_recordset(null::public.admin_review_sources,',
    literal(JSON.stringify(configuration.sources)) + '::jsonb) on conflict(queue_key) do nothing;',
    'insert into public.admin_review_finding_codes(queue_key,code,subtitle_match,note)',
    "select queue_key,code,subtitle_match,'CI static configuration' from jsonb_to_recordset(",
    literal(JSON.stringify(configuration.findingCodes)) +
      '::jsonb) x(queue_key text,code text,subtitle_match text)',
    'on conflict do nothing;',
    // Archived rows are intentionally absent from an anonymous production
    // export. Create one locally, without copying private/archived records.
    'insert into public.venues(id,name,address,category,slug,review_status)',
    "select '00000000-0000-4000-a000-000000004575','CI archived venue','Synthetic CI address',",
    "category,'ci-archived-venue','archived' from public.venues limit 1 on conflict(id) do nothing;",
    // The legacy admin venues URL resolves to the organisations directory.
    'insert into public.organizations(id,name,slug,status)',
    "values ('00000000-0000-4000-a000-000000004579','CI archived organization','ci-archived-organization','archived') on conflict(id) do nothing;",
    'insert into public.review_queue(id,entity_type,entity_id,review_type,details,status,created_at)',
    "values ('00000000-0000-4000-a000-000000004576','venue','00000000-0000-4000-a000-000000004575',",
    "'CI_MANUAL_REVIEW','{\"title\":\"CI synthetic review decision\"}','pending',now()-interval '8 days'),",
    "('00000000-0000-4000-a000-000000004577','venue','00000000-0000-4000-a000-000000004575',",
    "'VENUE_SOURCE_EVIDENCE','{\"title\":\"CI synthetic source finding\"}','pending',now()-interval '8 days')",
    'on conflict(id) do nothing;',
    'insert into public.admin_review_cases(id,case_key,family,stage,required_role,item,members,fingerprint,active,created_at)',
    "select '00000000-0000-4000-a000-000000004578','ci-review-decision','record','ready','admin',",
    'to_jsonb(v)||\'{"source_label":"Record correctness","risk":"integrity","sla_hours":168,"can_reopen":false}\'::jsonb,',
    "jsonb_build_array(to_jsonb(v)),'ci-review-fixture',true,v.created_at",
    "from public.admin_review_src_general_review v where v.id='00000000-0000-4000-a000-000000004576'",
    'on conflict(id) do nothing;',
    'commit;',
    // Build real counts and top rows from the local source views. Do not
    // manufacture summary responses or bypass the RPC authorization layer.
    'select public.refresh_admin_review_queue_counts();',
    'select public.refresh_admin_review_queue_top();',
    // Fail before spending minutes on browser retries if fixture coverage
    // regresses. These are positive controls already required by the specs.
    'do $fixtures$ begin',
    "if (select count(*) from public.admin_review_sources where active)<18 then raise exception 'CI review source registry is incomplete'; end if;",
    "if not exists(select 1 from public.admin_review_cases where active and stage='ready') then raise exception 'CI review worklist is empty'; end if;",
    "if not exists(select 1 from public.admin_review_queue_counts where findings>0) or not exists(select 1 from public.admin_review_queue_counts where decisions>0) then raise exception 'CI requires real finding and decision fixtures'; end if;",
    "if (select count(*) from public.venues where slug in ('scum-and-villainy-cantina','checkpoint-zuerich','demask','lehighton'))<>4 then raise exception 'CI venue route fixtures are missing'; end if;",
    "if (select count(*) from public.unified_tags where slug in ('lesbian','acceptance','transgender'))<>3 then raise exception 'CI glossary route fixtures are missing'; end if;",
    "if not exists(select 1 from public.organizations where slug='supergayunderwear') then raise exception 'CI merchant organization fixture is missing'; end if;",
    "if not exists(select 1 from public.organizations where slug='ci-archived-organization' and status='archived') then raise exception 'CI archived organization fixture is missing'; end if;",
    "if exists(select 1 from public.sti_profiles p left join public.unified_tags t on t.id=p.tag_id where t.id is null) or exists(select 1 from (select tag_a_id id from public.substance_interactions union select tag_b_id from public.substance_interactions) i left join public.unified_tags t on t.id=i.id where t.id is null) then raise exception 'CI safety charts lost referenced tags'; end if;",
    "if (select count(distinct subcategory_group) from public.marketplace_listings where status='active' and overview_eligible and content_rating in ('sfw','suggestive') and subcategory_group is not null and subcategory_group<>'other')<=20 then raise exception 'CI marketplace sample lacks group coverage'; end if;",
    "if not exists(select 1 from public.events where (event_type ilike '%pride%' or event_type ilike '%festival%') and start_date between now() and now()+interval '120 days' and duplicate_of_id is null) then raise exception 'CI upcoming Pride sample is empty'; end if;",
    'end $fixtures$;',
  ].join('\n');
}

export async function verifyLocalFixtures(env = process.env) {
  const api = new URL(env.API_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(api.hostname)) {
    throw new Error('CI fixture verification requires a loopback API');
  }
  const headers = { apikey: env.ANON_KEY, 'Content-Type': 'application/json' };
  const login = await fetch(new URL('/auth/v1/token?grant_type=password', api), {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: env.E2E_ADMIN_EMAIL, password: env.E2E_ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!login.ok) throw new Error('CI admin sign-in failed: HTTP ' + login.status);
  const session = await login.json();
  if (!session.access_token) throw new Error('CI admin sign-in returned no access token');
  async function rpc(name, body, token = session.access_token) {
    const result = await fetch(new URL('/rest/v1/rpc/' + name, api), {
      method: 'POST',
      headers: { ...headers, Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!result.ok)
      throw new Error(name + ' failed: HTTP ' + result.status + ' ' + (await result.text()));
    return result.json();
  }
  const archivedResponse = await fetch(
    new URL(
      '/rest/v1/organizations?select=id&slug=eq.ci-archived-organization&status=eq.archived',
      api,
    ),
    {
      headers: { ...headers, Authorization: 'Bearer ' + session.access_token },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!archivedResponse.ok || (await archivedResponse.json()).length !== 1) {
    throw new Error('CI archived organization is not visible to the real admin API');
  }
  const ready = await rpc('get_admin_review_worklist', { p_scope: 'ready' });
  if (!(
    ready.sources?.length >= 18 &&
    ready.findings_total > 0 &&
    ready.decisions_total > 0 &&
    ready.worklist_available &&
    ready.ready_total > 0 &&
    ready.sources.reduce((n, source) => n + source.count, 0) === ready.all_total &&
    ready.decisions_total + ready.findings_total === ready.all_total &&
    ready.ready_total + ready.research_total + ready.blocked_total === ready.case_total
  )) {
    throw new Error('CI review fixtures do not satisfy the non-degenerate review contract');
  }
  const all = await rpc('get_admin_review_queue', { p_scope: 'all' });
  if (!(all.total === all.all_total && all.total > all.decisions_total)) {
    throw new Error('CI raw review queue is missing its finding/decision partition');
  }
  const transmission = await rpc('sti_transmission_matrix', {}, env.ANON_KEY);
  const protection = await rpc('sti_protection_matrix', {}, env.ANON_KEY);
  const interactions = await rpc('substance_interaction_matrix', {}, env.ANON_KEY);
  const groups = await rpc(
    'get_marketplace_subcategory_group_counts',
    { p_include_adult: false },
    env.ANON_KEY,
  );
  if (!(
    transmission.stis?.length >= 8 &&
    transmission.cells?.length > 50 &&
    protection.testing?.length >= 8 &&
    interactions.axis?.length >= 45 &&
    interactions.cells?.length >= 460 &&
    groups.length > 20
  )) {
    throw new Error('CI public safety/marketplace fixtures lack browser-test coverage');
  }
  console.log(
    'CI fixtures verified: public route records, archived venue, ' +
      ready.sources.length +
      ' review sources, real review RPCs, and public safety/marketplace RPCs.',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'manifest') {
    process.stdout.write(
      manifestSql({
        maxBytes: Number(process.env.FULL_MAX_BYTES || 20_000_000),
        rowCap: Number(process.env.ROW_CAP || 3000),
        fullTables: (process.env.FULL_TABLES || 'unified_tags').split(',').filter(Boolean),
      }) + '\n',
    );
  } else if (process.argv[2] === 'cache-key') {
    process.stdout.write(snapshotCacheKey() + '\n');
  } else if (process.argv[2] === 'seed-admin') {
    assertLocalDatabase(process.env.DB_URL);
    process.stdout.write(adminSeedSql() + '\n');
  } else if (process.argv[2] === 'verify') {
    await verifyLocalFixtures();
  } else throw new Error('Usage: snapshot-fixtures.mjs manifest|cache-key|seed-admin|verify');
}
