/**
 * Import the Swiss sexual-health registry as support organizations.
 *
 * SOURCE   https://aids.ch/en/addresses — the Swiss AIDS Federation's public
 *          view of repertoire-sante-sexuelle.ch, the national registry run with
 *          Sexuelle Gesundheit Schweiz. 201 counselling, testing and treatment
 *          centres, all 26 cantons, coordinates on every record.
 *
 * SHAPE    Unlike testfinder there is nothing to crawl: the page server-renders
 *          an empty list and its map component fetches the whole directory as
 *          one JSON document. `supabase/functions/_shared/aids-ch-parse.ts`
 *          documents how that endpoint was found and the four traps in it.
 *
 * IDENTITY `source.external_id` is the registry's own integer id, proven to be
 *          theirs by their `.../report-change/<id>/` links. Stored at
 *          `organizations.field_provenance.source.external_id` and looked up
 *          together with `source.name`, so a bare integer cannot collide with
 *          another directory's slug namespace.
 *
 * LOAD     is the edge function `source-aids-ch`, not a phase here — the feed is
 *          one request, so the recurring cron and the one-shot import are the
 *          same code path. `--phase load` below just invokes it.
 *
 * VERIFY   Each centre is re-checked against ITS OWN website. This establishes
 *          only that the facility still has a live web presence at the listed
 *          URL — not its opening hours, not its services, not that it is open
 *          today. No cheap automated check can, and claiming otherwise on
 *          health content would be worse than claiming nothing.
 *
 * PROMOTE  publishes ONLY rows whose own website answered. Everything else
 *          stays draft and invisible. Unlike the testfinder corpus this source
 *          is not stale — the registry carries per-record change-report links
 *          and is actively curated — but "actively curated upstream" is a claim
 *          about the source, and the bar here is evidence about the record.
 *
 * USAGE
 *   node scripts/data-quality/import-aids-ch.mjs --phase load    [--dry-run]
 *   node scripts/data-quality/import-aids-ch.mjs --phase verify  [--limit N]
 *   node scripts/data-quality/import-aids-ch.mjs --phase promote [--dry-run]
 *   node scripts/data-quality/import-aids-ch.mjs --phase reindex
 *   node scripts/data-quality/import-aids-ch.mjs --phase report
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const SOURCE = 'aids-ch';
const FN_URL = `https://${PROJECT}.supabase.co/functions/v1/source-aids-ch`;
const OUT = join(process.cwd(), 'out-aids-ch');
const VERIFIED = join(OUT, 'verified.ndjson');

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : d;
};
const has = (n) => args.includes(`--${n}`);

const PHASE = flag('phase', 'report');
const DRY = has('dry-run');
const LIMIT = flag('limit') ? Number(flag('limit')) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A BROWSER User-Agent for the verify pass, deliberately. This stage touches
// ~190 unrelated third-party hosts once each and many sit behind a WAF that
// 403s an unknown UA on sight. import-testfinder.mjs measured that: 3 of the
// first 4 403s answered 200 from a normal browser UA. Treating a bot-block as a
// dead clinic withholds real testing sites from users.
const VERIFY_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// ------------------------------------------------------------------ database

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}

async function sql(query, attempt = 1) {
  const MAX_ATTEMPTS = 5;
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 400);
      const retriable = res.status === 429 || res.status >= 500;
      if (retriable && attempt < MAX_ATTEMPTS) {
        console.warn(`[sql] ${res.status}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
        await sleep(2000 * attempt);
        return sql(query, attempt + 1);
      }
      throw new Error(`mgmt API ${res.status}: ${body}`);
    }
    return res.json();
  } catch (e) {
    if (e instanceof Error && !/^mgmt API \d/.test(e.message) && attempt < MAX_ATTEMPTS) {
      console.warn(`[sql] ${e.message}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
      await sleep(2000 * attempt);
      return sql(query, attempt + 1);
    }
    throw e;
  }
}

const readNdjson = (p) =>
  existsSync(p)
    ? readFileSync(p, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
const writeNdjson = (p, rows) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
};

/** SQL string literal. Every value here is ours, but quoting is not optional. */
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------------- load

async function phaseLoad() {
  // The edge function is gated by `requireInternalOrAdmin`, and the secret it
  // wants lives in the vault rather than on this machine — so the invocation
  // goes through the database via pg_net, exactly as the cron does. That also
  // means this phase exercises the real production path rather than a
  // script-only shortcut that could rot independently of it.
  if (DRY) {
    console.log(`[load] DRY RUN — would POST ${FN_URL} with {"dry_run":true} via pg_net`);
    return;
  }

  const res = await sql(`
    select net.http_post(
      url := ${lit(FN_URL)},
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')
      ),
      body := jsonb_build_object('triggered_by', 'import-aids-ch.mjs'),
      timeout_milliseconds := 120000
    ) as request_id;`);
  const requestId = res?.[0]?.request_id;
  console.log(`[load] dispatched request_id=${requestId}`);

  // pg_net is asynchronous: the row above only says the request was queued.
  // Poll `net._http_response` BY REQUEST ID — never by recency and never by
  // URL. That table is shared by every caller on the instance and has no url
  // column at all; a "newest row" reader already mis-attributed one function's
  // response to another during the #2795 verification.
  for (let i = 0; i < 40; i += 1) {
    await sleep(3000);
    const r = await sql(
      `select status_code, left(content, 4000) as content, error_msg
         from net._http_response where id = ${Number(requestId)};`,
    );
    if (r?.length) {
      console.log(`[load] status=${r[0].status_code} ${r[0].error_msg ?? ''}`);
      console.log(`[load] ${r[0].content}`);
      return;
    }
  }
  console.warn('[load] no response row after 120s — check net._http_response by that id later');
}

// -------------------------------------------------------------------- verify

async function verifyOne(row) {
  if (!row.website) return { status: 'no_website', checked_at: new Date().toISOString() };

  const started = Date.now();
  try {
    const res = await fetch(row.website, {
      headers: { 'User-Agent': VERIFY_UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    const body = res.ok ? (await res.text()).slice(0, 200_000) : '';
    // Distinctive tokens only: short or common words match anything, and this
    // corpus is full of them ("Beratungsstelle", "Centre", "Spital").
    const tokens = String(row.name ?? '')
      .toLowerCase()
      .split(/[^a-zà-öø-ÿ0-9]+/i)
      .filter((t) => t.length >= 6);
    const haystack = body.toLowerCase();
    const nameMatch = tokens.length > 0 && tokens.some((t) => haystack.includes(t));

    // 401/403/429 are UNVERIFIABLE, not dead — the request was refused, which
    // says nothing about whether the clinic exists. Only a 404/410 or a 5xx is
    // evidence against it. Unverifiable rows stay draft, because absence of
    // evidence is not evidence of freshness, but they are not link rot either.
    const blocked = res.status === 401 || res.status === 403 || res.status === 429;
    return {
      status: res.ok ? 'live' : blocked ? 'unverifiable' : 'unreachable',
      http_status: res.status,
      final_url: res.url,
      name_match: nameMatch,
      ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    };
  } catch (e) {
    return {
      status: 'unreachable',
      error: String(e?.message ?? e).slice(0, 200),
      ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    };
  }
}

async function loadRowsFromDb() {
  const res = await sql(`
    select id::text,
           name,
           website,
           field_provenance->'source'->>'external_id' as external_id
      from public.organizations
     where ${lit(SOURCE)} = any(tags)
       and duplicate_of_id is null
     order by name;`);
  return Array.isArray(res) ? res : [];
}

async function phaseVerify() {
  let list = await loadRowsFromDb();
  if (!list.length) throw new Error(`no ${SOURCE} organizations in the database — run --phase load first`);
  if (LIMIT) list = list.slice(0, LIMIT);

  const prior = new Map(readNdjson(VERIFIED).map((r) => [r.external_id, r]));
  const out = [];
  // Distinct third-party hosts, one request each, so a little concurrency is
  // fine and the pass drops from ~15 min to ~2.
  const POOL = 8;
  let idx = 0;
  let done = 0;
  async function worker() {
    while (idx < list.length) {
      const row = list[idx++];
      const cached = prior.get(row.external_id);
      // Reuse only a prior LIVE result. Anything else is re-checked so a fix to
      // the UA or the classifier actually reaches the records it was for.
      const verification =
        cached?.verification?.status === 'live' ? cached.verification : await verifyOne(row);
      out.push({ ...row, verification });
      done += 1;
      if (done % 25 === 0) console.log(`[verify]   ${done}/${list.length}`);
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker));

  writeNdjson(VERIFIED, out);
  const tally = out.reduce(
    (a, r) => ((a[r.verification.status] = (a[r.verification.status] ?? 0) + 1), a),
    {},
  );
  console.log(`\n[verify] wrote ${out.length} -> ${VERIFIED}`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`[verify]   ${k}: ${v}`);
  }
  console.log(`[verify]   name matched on page: ${out.filter((r) => r.verification.name_match).length}`);

  if (DRY) {
    console.log('[verify] DRY RUN — verification not written back to the database.');
    return;
  }

  // Stamp the result on the row so `--phase promote` reads the database rather
  // than a local file, and so a human looking at the org can see what was
  // checked and when.
  const live = out.filter((r) => r.verification.status === 'live');
  const CHUNK = 40;
  for (let i = 0; i < out.length; i += CHUNK) {
    const values = out
      .slice(i, i + CHUNK)
      .map((r) => `(${lit(r.id)}::uuid, ${lit(JSON.stringify(r.verification))}::jsonb)`)
      .join(',');
    await sql(`
      update public.organizations o
         set enrichment_status = o.enrichment_status
               || jsonb_build_object(${lit(SOURCE)},
                    coalesce(o.enrichment_status->${lit(SOURCE)}, '{}'::jsonb)
                    || jsonb_build_object('verification', v.payload)),
             updated_at = now()
        from (values ${values}) as v(id, payload)
       where o.id = v.id;`);
  }
  console.log(`[verify] stamped ${out.length} rows (${live.length} live)`);
}

// ------------------------------------------------------------------- promote

async function phasePromote() {
  // Publication bar: the facility's own website answered. Everything else stays
  // draft and invisible — `organizations_public_read` requires status='active'.
  const predicate = `
      ${lit(SOURCE)} = any(tags)
      and status = 'draft'
      and duplicate_of_id is null
      and enrichment_status->${lit(SOURCE)}->'verification'->>'status' = 'live'`;

  const preview = await sql(`
    select count(*) filter (where ${predicate}) as promotable,
           count(*) filter (where ${lit(SOURCE)} = any(tags) and status='draft') as still_draft,
           count(*) filter (where ${lit(SOURCE)} = any(tags) and status='active') as already_active,
           count(*) filter (where ${lit(SOURCE)} = any(tags)) as total
      from public.organizations;`);
  console.log('[promote] ' + JSON.stringify(preview?.[0] ?? preview));

  if (DRY) {
    console.log('[promote] DRY RUN — nothing written.');
    return;
  }

  const res = await sql(`
    with promoted as (
      update public.organizations
         set status = 'active', updated_at = now()
       where ${predicate}
      returning id
    )
    select count(*) as promoted from promoted;`);
  console.log('[promote] ' + JSON.stringify(res?.[0] ?? res));

  // Newly-active rows must enter search; the indexer only sees status='active'.
  await phaseReindex();
}

async function phaseReindex() {
  let total = 0;
  for (let round = 0; round < 40; round += 1) {
    const res = await sql(`select public.run_org_search_reindex(500) as n;`);
    const n = Number(res?.[0]?.n ?? (Array.isArray(res) ? res[0]?.n : 0) ?? 0);
    total += n;
    console.log(`[reindex]   round ${round + 1}: ${n}`);
    if (n === 0) break;
  }
  console.log(`[reindex] reindexed ${total} organizations`);
}

// -------------------------------------------------------------------- report

async function phaseReport() {
  const rows = await sql(`
    select
      (select count(*) from public.organizations where ${lit(SOURCE)} = any(tags)) as total,
      (select count(*) from public.organizations where ${lit(SOURCE)} = any(tags) and status='active') as active,
      (select count(*) from public.organizations where ${lit(SOURCE)} = any(tags) and latitude is not null) as with_geo,
      (select count(*) from public.organizations where ${lit(SOURCE)} = any(tags) and city_id is not null) as with_city,
      -- Count rows with NO city, not rows carrying a note. Since the importer
      -- was routed through \`city_resolve_or_create\`, the note also records HOW a
      -- row resolved when it took a non-default arm ("resolved by alias",
      -- "resolved by postal_code"), so presence-of-note stopped meaning failure:
      -- it read 23 blocked when 23 had resolved and none had failed.
      (select count(*) from public.organizations
        where ${lit(SOURCE)} = any(tags) and city_id is null) as city_unresolved,
      (select count(*) from public.organizations
        where ${lit(SOURCE)} = any(tags)
          and enrichment_status->${lit(SOURCE)}->>'city_link_note' like 'resolved by %') as city_via_extra_arm,
      (select count(*) from public.search_documents sd
        join public.organizations o on o.id = sd.entity_id
       where sd.entity_type='organization' and ${lit(SOURCE)} = any(o.tags)) as in_search;`);
  console.log(JSON.stringify(rows?.[0] ?? rows, null, 2));

  const tags = await sql(`
    select t as tag, count(*) as n
      from public.organizations o, unnest(o.tags) t
     where ${lit(SOURCE)} = any(o.tags) and t <> ${lit(SOURCE)}
     group by t order by n desc;`);
  console.log('--- service tags ---');
  for (const r of tags ?? []) console.log(String(r.n).padStart(4), r.tag);
}

// ---------------------------------------------------------------------- main

const PHASES = {
  load: phaseLoad,
  verify: phaseVerify,
  promote: phasePromote,
  reindex: phaseReindex,
  report: phaseReport,
};

const fn = PHASES[PHASE];
if (!fn) {
  console.error(`unknown --phase ${PHASE}; expected one of ${Object.keys(PHASES).join(', ')}`);
  process.exit(1);
}
await fn();
