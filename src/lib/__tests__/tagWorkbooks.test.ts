// Guards the six workbook migrations and the glossary-band wiring.
//
// WHAT THIS EXISTS FOR
//
// The workbook feature publishes PROMPTS and withholds ANSWERS, and the whole
// separation is carried by a handful of lines that are individually easy to
// delete without breaking anything visible:
//
//   * the four self-only policies on the answer tables, and the ASYMMETRY in
//     them (insert/update require is_intimate_eligible, select/delete must not)
//   * `shared` defaulting to false — a default of true publishes every answer
//     the moment a handshake completes
//   * `workbook_compare` RETURNING rather than raising on no consent, which is
//     what keeps a partner's refusal indistinguishable from an empty overlap
//   * 'workbook' present in BOTH the kink_grants CHECK and the kink_grant_set
//     guard — the CHECK alone leaves the RPC raising 22023 on a kind the table
//     now accepts, which reads as the feature being broken
//   * the band being absent from the crawler path
//
// A behavioural test cannot reach most of these (the RLS cases live in
// supabase/migrations/__tests__/tag_workbook_rls.sql, which needs a database),
// so these are source assertions — run over COMMENT-STRIPPED SQL, because every
// one of these migrations quotes its own invariant in its header and an
// unstripped toContain would pass with the statement deleted.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const SRC = process.cwd();

const DEFINITION = '99991791361414_tag_workbook_definition.sql';
const ANSWERS = '99991791361449_tag_workbook_answers.sql';
const COMPARE = '99991791361479_workbook_compare_rpcs.sql';
const EXPORT = '99991791361504_workbook_gdpr_export.sql';
const TAXONOMY = '99991791362914_cnc_negotiation_taxonomy.sql';
const SEED = '99991791362936_workbook_content_seed.sql';

const strip = (raw: string) =>
  raw
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const read = (f: string) => strip(readFileSync(join(DIR, f), 'utf8'));
const readRaw = (f: string) => readFileSync(join(DIR, f), 'utf8');
const readSrc = (p: string) => readFileSync(join(SRC, p), 'utf8');

const between = (hay: string, from: string, to: string) => {
  const a = hay.indexOf(from);
  expect(a).toBeGreaterThan(-1);
  const b = hay.indexOf(to, a + from.length);
  expect(b).toBeGreaterThan(a);
  return hay.slice(a, b);
};

describe('all six migrations are present', () => {
  it('each file exists', () => {
    const files = new Set(readdirSync(DIR));
    for (const f of [DEFINITION, ANSWERS, COMPARE, EXPORT, TAXONOMY, SEED]) {
      expect(files.has(f), `${f} is missing`).toBe(true);
    }
  });

  it('they apply in dependency order', () => {
    // The answers table FKs tag_workbook_steps; the compare RPC reads both; the
    // export reads the answer tables; the seed needs the definition AND the
    // taxonomy. db push applies by version, so the versions must sort that way.
    const order = [DEFINITION, ANSWERS, COMPARE, EXPORT, TAXONOMY, SEED];
    const versions = order.map((f) => f.slice(0, 14));
    expect([...versions].sort()).toEqual(versions);
  });
});

describe('the answer tables are private, and privately in the right way', () => {
  const sql = read(ANSWERS);

  it('both tables take enable AND force row level security', () => {
    // Force matters because the reveal RPCs are definers owned by a
    // rolbypassrls role: without it that owner is a second bypass path.
    for (const table of ['tag_workbook_answers', 'tag_workbook_progress']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
    }
  });

  it('insert and update require is_intimate_eligible — four of them', () => {
    const writes = sql.match(/for (insert|update) to authenticated/g) ?? [];
    expect(writes.length).toBe(4);
    const gated = sql.match(/public\.is_intimate_eligible\(auth\.uid\(\)\)/g) ?? [];
    expect(gated.length).toBe(4);
  });

  it('select and delete do NOT require eligibility', () => {
    // The asymmetry copied from kink_ratings. An opted-out user must keep read
    // and erase on their own rows, or leaving the intimate layer traps their
    // data behind a gate they just walked out of.
    for (const table of ['tag_workbook_answers', 'tag_workbook_progress']) {
      for (const cmd of ['select', 'delete']) {
        const policy = between(sql, `create policy ${table}_self_${cmd} on public.${table}`, ';');
        expect(policy).toContain('user_id = auth.uid()');
        expect(policy, `${table}_self_${cmd} must not gate on eligibility`).not.toContain(
          'is_intimate_eligible',
        );
      }
    }
  });

  it('grants no privilege at all to anon', () => {
    // Checked as a privilege rather than a policy: a later policy edit cannot
    // re-expose what was never granted.
    expect(sql).not.toMatch(/grant[^;]*on public\.tag_workbook_answers[^;]*anon/);
    expect(sql).not.toMatch(/grant[^;]*on public\.tag_workbook_progress[^;]*anon/);
  });

  it('shared defaults to false', () => {
    const table = between(sql, 'create table if not exists public.tag_workbook_answers', ');');
    expect(table).toMatch(/shared\s+boolean not null default false/);
  });

  it('body is length-capped', () => {
    const table = between(sql, 'create table if not exists public.tag_workbook_answers', ');');
    expect(table).toMatch(/char_length\(body\) between 1 and 4000/);
  });

  it('both tables cascade from profiles(user_id) so erasure needs no code', () => {
    const cascades = sql.match(/references public\.profiles\(user_id\) on delete cascade/g) ?? [];
    expect(cascades.length).toBe(2);
  });

  it('an answer dies with the step it answers', () => {
    // Found by mutation: nothing asserted this. Without the cascade, deleting
    // a prompt orphans every answer to it — rows keyed to a step_id that no
    // longer resolves, invisible to the runner and still in the export.
    const table = between(sql, 'create table if not exists public.tag_workbook_answers', ');');
    expect(table).toContain('references public.tag_workbook_steps(id) on delete cascade');
  });

  it('progress dies with its workbook, and keeps a nullable last_step_id', () => {
    const table = between(sql, 'create table if not exists public.tag_workbook_progress', ');');
    expect(table).toContain('references public.tag_workbooks(id) on delete cascade');
    // last_step_id is a BOOKMARK, not a dependency: deleting the step it points
    // at must null the pointer rather than delete the reader's progress.
    expect(table).toContain(
      'last_step_id uuid references public.tag_workbook_steps(id) on delete set null',
    );
  });

  it('answers key on step_id, not on a position', () => {
    // Keying on position re-attaches an answer to a different prompt on every
    // reorder — the reason guide_sections could not host this.
    const table = between(sql, 'create table if not exists public.tag_workbook_answers', ');');
    expect(table).toContain('primary key (user_id, step_id)');
    expect(table).not.toContain('position');
  });
});

describe('the reveal cannot leak a refusal', () => {
  const sql = read(COMPARE);
  const compare = () => between(sql, 'create or replace function public.workbook_compare(', '$$;');
  const status = () =>
    between(sql, 'create or replace function public.workbook_compare_status(', '$$;');

  it('returns an empty set rather than raising when consent is absent', () => {
    const body = compare();
    expect(body).toContain("if public.workbook_compare_status(p_other) <> 'active' then");
    // `return;` and NOT `raise` — an error code would tell the caller the
    // other party has not reciprocated.
    const guard = between(body, "<> 'active' then", 'end if;');
    expect(guard).toMatch(/\breturn\s*;/);
    expect(guard).not.toContain('raise');
  });

  it('checks eligibility and blocks on BOTH sides before anything else', () => {
    const body = status();
    expect(body).toContain('public.intimate_is_blocked(v_uid, p_other)');
    expect(body).toContain('not public.is_intimate_eligible(v_uid)');
    expect(body).toContain('not public.is_intimate_eligible(p_other)');
  });

  it('derives consent from two live grant rows and stores no state', () => {
    const body = status();
    const grants = body.match(/kind = 'workbook' and revoked_at is null/g) ?? [];
    expect(grants.length).toBe(2);
    for (const s of ['active', 'requested_by_me', 'requested_by_other', 'none']) {
      expect(body).toContain(`'${s}'`);
    }
  });

  it('only reveals answers BOTH sides flagged shared', () => {
    const body = compare();
    // Two CTEs, each filtering a.shared — one per side.
    const shared = body.match(/a\.shared/g) ?? [];
    expect(shared.length).toBe(2);
    // And the join demands both bodies for a non-menu step.
    expect(body).toContain('m.body is not null and t.body is not null');
  });

  it('re-checks is_public inside the definer, where RLS does not apply', () => {
    const body = compare();
    expect(body).toContain('w.is_public');
    expect(body).toContain("t.status = 'active'");
  });

  it('is authenticated-only on both functions', () => {
    for (const fn of ['workbook_compare_status(uuid)', 'workbook_compare(uuid, uuid)']) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon`);
      expect(sql).toContain(`grant execute on function public.${fn} to authenticated`);
    }
  });

  it("adds 'workbook' to the CHECK *and* to the kink_grant_set guard", () => {
    // Both halves. The CHECK alone leaves the only writer raising 22023 on a
    // kind the table now accepts.
    expect(sql).toContain("check (kind in ('view','compare','workbook'))");
    expect(sql).toContain("'p_kind not in (''view'',''compare'',''workbook'')'");
  });

  it('patches kink_grant_set rather than restating it, and refuses to patch blind', () => {
    const patch = between(sql, 'do $patch$', 'end\n$patch$;');
    expect(patch).toContain('pg_get_functiondef');
    // A guard that is not in the expected shape must abort, not be rewritten.
    expect(patch).toContain('refusing to patch blind');
    // Idempotent: a re-run must notice the kind is already accepted.
    expect(patch).toContain("if position('''workbook''' in v_src) > 0 then");
  });

  it('asserts the patch did not eat the upsert, the revoke or the block check', () => {
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain('on conflict (grantor_id, grantee_id, kind) do update set');
    expect(verify).toContain('set revoked_at = now(), updated_at = now()');
    expect(verify).toContain('intimate_is_blocked');
  });
});

describe('the definition is public content and nothing more', () => {
  const sql = read(DEFINITION);

  it('gates public reads on is_public AND an active parent tag', () => {
    const policy = between(
      sql,
      'create policy tag_workbooks_public_read on public.tag_workbooks',
      ';',
    );
    expect(policy).toContain('is_public');
    expect(policy).toContain("t.status = 'active'");
  });

  it('cannot publish an incomplete workbook', () => {
    expect(sql).toContain('tag_workbooks_public_requires_content');
    const check = between(sql, 'tag_workbooks_public_requires_content', '),');
    expect(check).toContain('title is not null');
    expect(check).toContain('intro_md is not null');
    expect(check).toContain("kind <> 'program' or day_count is not null");
  });

  it('defaults is_public to false', () => {
    expect(sql).toMatch(/is_public\s+boolean not null default false/);
  });

  it('a menu step must name a category and a non-menu step must not', () => {
    // Both directions in one constraint: a menu step with no category renders
    // an empty step, a non-menu step with one renders two controls.
    expect(sql).toContain("check ((kind = 'menu') = (kink_category_slug is not null))");
  });

  it('steps carry a stable `key` unique per workbook', () => {
    expect(sql).toContain('unique (workbook_id, key)');
  });

  it('the read RPCs are anon-executable and filter is_public internally', () => {
    for (const fn of ['get_tag_workbooks(uuid)', 'get_tag_workbook_by_slug(text)']) {
      expect(sql).toContain(`revoke all on function public.${fn} from public;`);
      expect(sql).toContain(
        `grant execute on function public.${fn} to anon, authenticated, service_role`,
      );
    }
    const byTag = between(sql, 'create or replace function public.get_tag_workbooks(', '$$;');
    expect(byTag).toContain('w.is_public');
    expect(byTag).toContain("t.status = 'active'");
  });

  it('get_tag_workbooks returns an array, never null', () => {
    // A null would make the band's emptiness check ambiguous.
    const byTag = between(sql, 'create or replace function public.get_tag_workbooks(', '$$;');
    expect(byTag).toContain("'[]'::jsonb");
  });

  it('neither RPC can reach an answer', () => {
    // By construction, not by filter: the word must not appear at all.
    expect(sql).not.toContain('tag_workbook_answers');
  });
});

describe('the GDPR export covers the new tables without dropping the old ones', () => {
  const sql = read(EXPORT);
  // SCOPED TO THE FUNCTION BODY, and this is load-bearing. The migration's own
  // verify block re-states every key name, the kink_grants disjunction and the
  // self-gate in order to assert them — so a `toContain` over the whole file
  // matches the POSTCONDITION and passes with the statement deleted. Mutation
  // testing caught exactly that: three assertions here survived "drop a
  // pre-existing export key", "narrow kink_grants to grantor only" and "drop
  // the self-gate" before this slice existed.
  const body = between(sql, 'as $$\ndeclare', '$$;\n\nrevoke all');

  it('adds both workbook keys, scoped to the subject', () => {
    expect(body).toContain(
      "'workbook_answers',    (select jsonb_agg(to_jsonb(x)) from tag_workbook_answers x where x.user_id = p_user_id)",
    );
    expect(body).toContain(
      "'workbook_progress',   (select jsonb_agg(to_jsonb(x)) from tag_workbook_progress x where x.user_id = p_user_id)",
    );
  });

  it('keeps every pre-existing key — a re-emit is a whole-body rewrite', () => {
    for (const k of [
      'profile',
      'profile_attic',
      'intimate_profile',
      'intimate_profile_text',
      'kink_ratings',
      'kink_category_visibility',
      'kink_grants',
      'kink_share_links',
      'travel_preferences',
      'trips',
      'venue_reviews',
      'marketplace_reviews',
      'community_posts',
      'photos',
      'notifications',
      'venue_checkins',
      'favorites',
    ]) {
      expect(body, `export lost the '${k}' key`).toContain(`'${k}',`);
    }
  });

  it('keeps the two-party disjunction on kink_grants', () => {
    // Workbook grants live in that table, so narrowing it to grantor_id would
    // stop exporting the access a subject was GIVEN.
    expect(body).toContain('x.grantor_id = p_user_id or x.grantee_id = p_user_id');
  });

  it('keeps the self-gate and stays authenticated-only', () => {
    expect(body).toContain('auth.uid() <> p_user_id');
    expect(sql).toContain('revoke all on function public.export_my_data(uuid) from public, anon');
  });

  it('and the verify block still asserts all of the above', () => {
    // The mirror: scoping the assertions to the body means a deleted
    // postcondition would no longer fail any check above, so it is asserted
    // here on purpose rather than left to the body slice.
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain("'workbook_answers'");
    expect(verify).toContain("'workbook_progress'");
    expect(verify).toContain('x.grantor_id = p_user_id or x.grantee_id = p_user_id');
    expect(verify).toContain('auth.uid() <> p_user_id');
  });
});

describe('the CNC menu is taxonomy, not a second rating engine', () => {
  const sql = read(TAXONOMY);

  it('is a dom_sub category, so kink_compare pairs the right sides', () => {
    expect(sql).toContain("'dom_sub'");
  });

  it('every item is discussion_recommended', () => {
    // The column defaults false, so this is an explicit true in the insert —
    // a missed row would present a CNC scenario as safe to discover in a
    // compare view.
    const insert = between(
      sql,
      'insert into public.kink_items',
      'on conflict (slug) do update set',
    );
    expect(insert).toContain('true');
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain('and is_active and not discussion_recommended');
  });

  it('asserts 20 DISTINCT descriptions', () => {
    // One description pasted across a family erases exactly the distinction a
    // reader is being asked to rate apart.
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain('count(distinct description)');
    expect(verify).toMatch(/v_bad <> 20/);
  });

  it('leaves the pre-existing cnc-roleplay item alone, and asserts it', () => {
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain("i.slug = 'cnc-roleplay'");
    expect(verify).toContain("c.slug = 'roleplay-fantasy'");
    // It must not be in the seed's own slug list.
    const insert = between(
      sql,
      'insert into public.kink_items',
      'on conflict (slug) do update set',
    );
    expect(insert).not.toContain("'cnc-roleplay'");
  });

  it('its taxonomy-intact floor is not an exact-match precondition', () => {
    // 19 existing + 1 new = 20, so a floor of 20 would abort db push for the
    // whole repo the first time anyone legitimately retires a category.
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain('v_bad < 15');
    expect(verify).not.toContain('v_bad < 20');
  });
});

describe('the content seed', () => {
  const sql = read(SEED);

  it('declares an actor, which the is_adult recompute requires', () => {
    // Without it the junction trigger's follow-on UPDATE of is_adult hits
    // log_unified_tag_change's refusal on a human_reviewed row.
    expect(sql).toContain("set_config('app.actor', 'migration:");
    expect(sql).toContain('99991791362936_workbook_content_seed');
  });

  it('stamps human_reviewed so deprecate_unused_tags cannot take the new term', () => {
    // That function selects exactly active + human_reviewed=false + usage 0,
    // and a brand-new host term has usage 0.
    const insert = between(sql, 'insert into public.unified_tags', 'on conflict (slug) do nothing');
    expect(insert).toContain('human_reviewed');
  });

  it('sets publication_role explicitly', () => {
    // NOT NULL with no default, and validate_tag_entity_target() raises a
    // misleading entity-redirect error on a NULL.
    const insert = between(sql, 'insert into public.unified_tags', 'on conflict (slug) do nothing');
    expect(insert).toContain('publication_role');
    expect(insert).toContain("'utility'");
  });

  it('does NOT hand-set is_adult, which is derived from the category', () => {
    const insert = between(sql, 'insert into public.unified_tags', 'on conflict (slug) do nothing');
    expect(insert).not.toContain('is_adult');
  });

  it('hosts the burnout workbook on kink-burnout, never on the substance sense', () => {
    // `burnout` is live and means drug-comedown exhaustion, filed under
    // Substances & Recovery. Hosting a power-exchange reflection there is the
    // wrong-sense defect this corpus has repaired many times over.
    expect(sql).toContain("('kink-burnout', 'burnout-reset'");
    expect(sql).not.toMatch(/\('burnout',\s*'burnout-reset'/);
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain("ilike '%drug%'");
    expect(verify).toContain("ilike '%rave%'");
  });

  it('uses the CANONICAL cnc slug, not the merged redirect', () => {
    expect(sql).toContain("'consensual-non-consent-cnc'");
    expect(sql).not.toMatch(/\('consensual-non-consent',\s*'cnc-negotiation-menu'/);
  });

  it('asserts all three category representations arrive', () => {
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain('t.category = c.name');
    expect(verify).toContain('a.is_primary');
    expect(verify).toContain('t.category_id');
  });

  it('asserts the chastity safety override survives an edit', () => {
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain("ilike '%numbness%'");
    expect(verify).toContain("ilike '%outrank%'");
  });

  it('paces the program and asserts it is paced', () => {
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain('s.day_offset is null');
    expect(verify).toContain('count(distinct s.day_offset)');
  });

  it('refuses a prompt duplicated inside one workbook', () => {
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain('group by s.workbook_id, s.prompt_md');
    expect(verify).toContain('having count(*) > 1');
  });

  it('every prose step gets a body from the follow-up UPDATE', () => {
    // A prose step inserted with a null prompt_md renders a heading and
    // nothing, and the insert above deliberately leaves them null.
    const verify = between(sql, 'do $verify$', 'end\n$verify$;');
    expect(verify).toContain("s.kind = 'prose'");
    expect(verify).toContain('P3b failed');
  });
});

describe('the glossary band is wired and stays out of the crawler path', () => {
  const page = readSrc('src/pages/TagDetail.tsx');
  const band = readSrc('src/components/tags/TagWorkbooks.tsx');
  const detail = readSrc('functions/_lib/detail.ts');

  it('pushes its station in the same position the JSX renders it', () => {
    // useActiveStation derives the active stop from document geometry, so a
    // mismatch highlights the wrong stop while scrolling.
    const stationOrder = [...page.matchAll(/s\.push\(\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
    const iMythStation = stationOrder.indexOf('myths');
    const iWorkStation = stationOrder.indexOf('workbooks');
    const iFigStation = stationOrder.indexOf('figure');
    expect(iWorkStation).toBeGreaterThan(iMythStation);
    expect(iFigStation).toBeGreaterThan(iWorkStation);

    const iMythJsx = page.indexOf('<TagMythFacts');
    const iWorkJsx = page.indexOf('<TagWorkbooks');
    const iFigJsx = page.indexOf('<TagInfographics');
    expect(iWorkJsx).toBeGreaterThan(iMythJsx);
    expect(iFigJsx).toBeGreaterThan(iWorkJsx);
  });

  it('carries workbookCount in the stations memo deps', () => {
    // The RPC resolves after first render; omitting it pins the stop to 0
    // forever — the trap the codes/STI/myth counts all document.
    const deps = between(page, '}, [\n    tag,', ']);');
    expect(deps).toContain('workbookCount');
  });

  it('points the rail row at the in-page anchor rather than copying the list', () => {
    expect(page).toContain('href="#workbooks"');
  });

  it('renders nothing when the term carries no workbook', () => {
    expect(band).toContain('if (!workbooks || workbooks.length === 0) return null;');
  });

  it('shows no prompts to a signed-out or non-eligible reader', () => {
    expect(band).toContain('const locked = !user || !me?.opted_in_at;');
    // And it never renders a step body — the band shows title/dek/counts only.
    expect(band).not.toContain('prompt_md');
  });

  it('uses the overlay-sibling link pattern, not a wrapping anchor', () => {
    // A card-wide anchor around the heading and badges is the
    // nested-interactive violation (axe serious, WCAG 4.1.2). min-h-0 because
    // @layer base gives every button 44px.
    expect(band).toContain('absolute inset-0 min-h-0');
    expect(band).toContain('no-underline');
    expect(band).toContain('aria-label');
  });

  it('is absent from the crawler renderer', () => {
    // TagDiagnosticCodes is the precedent: interactive state is not indexable
    // prose, and a fetch here would have to sit after both gates and repeat
    // is_public as an explicit filter because fetchRows uses the service role.
    expect(detail).not.toContain('tag_workbook');
    expect(detail).not.toContain('get_tag_workbooks');
  });
});

describe('the runner inherits the checklist posture', () => {
  const runner = readSrc('src/pages/tools/WorkbookRunner.tsx');
  const routes = readSrc('src/routes.tsx');
  const menu = readSrc('src/components/workbooks/WorkbookMenuStep.tsx');
  const share = readSrc('src/components/workbooks/WorkbookShareStep.tsx');

  it('lives under /tools, beside the checklist', () => {
    expect(routes).toContain('path="tools/workbook/:slug"');
  });

  it('is absent from every sitemap', () => {
    const sitemap = readSrc('functions/sitemap-static.xml.ts');
    expect(sitemap).not.toContain('tools/workbook');
    expect(sitemap).not.toContain('tools/checklist');
  });

  it('gates on sign-in and then on the intimate opt-in', () => {
    expect(runner).toContain('if (!user)');
    expect(runner).toContain('if (!me?.opted_in_at)');
    expect(runner).toContain('/intimate/onboard');
  });

  it('stamps started_at once, since the program pacing reads it', () => {
    // Re-stamping on every step resets the clock and re-locks days the reader
    // has already unlocked.
    expect(runner).toContain('started.current');
  });

  it('states a locked day rather than hiding it', () => {
    // A four-day program that silently showed one step reads as a one-step
    // workbook.
    expect(runner).toContain('lockedCount');
    expect(runner).toContain('daysUntilUnlock');
  });

  it('the menu step stores nothing of its own', () => {
    // It writes kink_ratings through the existing hooks. A second rating store
    // would duplicate the scale, the tiers, the compare and the export.
    expect(menu).toContain('useUpsertKinkRatings');
    expect(menu).toContain('KinkRatingControl');
    expect(menu).not.toContain('tag_workbook_answers');
  });

  it('the share step describes state from the handshake, not from a row count', () => {
    // workbook_compare returns empty for both "no consent" and "no overlap",
    // so inferring from rows would claim to know which.
    expect(share).toContain('useWorkbookCompareStatus');
    expect(share).toContain("status === 'requested_by_me'");
    expect(share).toContain("status === 'requested_by_other'");
  });
});

describe('the migration headers do not assert the stale trigger claim', () => {
  it('the seed records that BOTH category triggers fire on INSERT', () => {
    // Measured on prod: trg_sync_tag_category is BEFORE INSERT OR UPDATE and
    // trg_sync_tag_category_after is AFTER INSERT OR UPDATE OF category_id.
    // CLAUDE.md's "neither fires on INSERT" is stale, and a future pass reading
    // only that note would hand-set all three representations and bypass the
    // path this file relies on.
    const raw = readRaw(SEED);
    expect(raw).toContain('Both fire on INSERT');
  });
});
