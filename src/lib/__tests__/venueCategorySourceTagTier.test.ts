// Guards 99991791179763_venue_category_source_tag_tier.sql.
//
// Three things this file exists to stop, each of which already happened once:
//
//  1. The visit-once cursor coming back. `not (enrichment_status ? 'category_backfill')`
//     made the reclassifier examine ZERO rows while 5,581 live venues sat at `other`,
//     and the cron reported success every night. A `create or replace` that restates the
//     function from an older copy reinstates it silently.
//  2. `restaurants` being re-added to the mapping. It was in it, cleared a 4-of-70
//     sample, and was removed after all 71 names were read: a supermarket, a strip club,
//     seven bars and three cafes. A later pass sampling the same family will clear it
//     again.
//  3. A name being read before a source. The whole tier is "source beats name", so
//     `infer_venue_category` must stay reachable only after the mapping has declined.
//
// Assertions are made against COMMENT-STRIPPED sql, because this migration's header
// quotes every phrase being asserted — including the `restaurants` rejection and the old
// predicate — so an unstripped `toContain` passes with the statement deleted.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991791179763_venue_category_source_tag_tier.sql';
const DIR = join(process.cwd(), 'supabase', 'migrations');

const raw = readFileSync(join(DIR, MIGRATION), 'utf8');

// Strip only whole-line comments: a mid-line `--` can sit inside a quoted string.
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const between = (from: string, to: string) => {
  const a = sql.indexOf(from);
  expect(a).toBeGreaterThan(-1);
  const b = sql.indexOf(to, a + from.length);
  expect(b).toBeGreaterThan(a);
  return sql.slice(a, b);
};

const fnBody = () =>
  between('create or replace function public.run_venue_category_reclassify', '$function$;');
const verify = () => between('do $verify$', 'end $verify$;');
const applyBlock = () => between('do $apply$', 'end $apply$;');
const mappingInsert = () =>
  between(
    'insert into public.venue_category_source_tags(provider_tag, category, note) values',
    'on conflict (provider_tag) do nothing;',
  );
const noiseInsert = () =>
  between(
    'insert into public.venue_category_source_tag_noise(token) values',
    'on conflict (token) do nothing;',
  );

describe('the migration exists under its own version', () => {
  it('is present in supabase/migrations', () => {
    expect(readdirSync(DIR)).toContain(MIGRATION);
  });

  it('leaves executable statements after comments are stripped', () => {
    // A file whose body is all prose would satisfy every negative assertion below.
    expect(sql).toContain('create or replace function public.run_venue_category_reclassify');
    expect(sql.length).toBeGreaterThan(2000);
  });
});

describe('the cursor is fillable-gap driven, not visit-once', () => {
  it('selects a never-visited row OR one whose gap the tier can now close', () => {
    const body = fnBody();
    expect(body).toMatch(/WHERE NOT c\.visited\s*\n\s*OR \(cardinality\(c\.provider_cats\) = 1/);
  });

  it('does not gate the whole candidate set on never having been visited', () => {
    // The defect: a row is either never-visited or permanently done. `visited` may be
    // COMPUTED (it is, as a column) but must never be the sole selector.
    const body = fnBody();
    expect(body).not.toMatch(
      /AND NOT \(coalesce\(v\.enrichment_status[^)]*\) \? 'category_backfill'\)/,
    );
  });

  it('re-opens only where a mapping row can actually close the gap', () => {
    // Re-opening every no_signal row would re-write thousands of venues nightly through
    // the search trigger with nothing to write. Both conditions are required.
    const body = fnBody();
    const reopen = body.slice(body.indexOf('WHERE NOT c.visited'));
    expect(reopen).toContain('cardinality(c.provider_cats) = 1');
    expect(reopen).toContain('FROM public.venue_category_source_tags m');
    expect(reopen).toContain('WHERE m.provider_tag = c.provider_cats[1]');
  });

  it('reports how many rows the re-open arm supplied', () => {
    // Without this, a cursor fix and a cursor that still reaches nothing both return
    // the same shape.
    const body = fnBody();
    expect(body).toContain("'reopened', v_reopened");
    expect(body).toMatch(/IF rec\.reopened THEN v_reopened := v_reopened \+ 1; END IF;/);
  });
});

describe('source beats name', () => {
  // `FROM public.venue_category_source_tags m` occurs TWICE — first in the candidate
  // CTE's re-open arm, then in the tier itself — so ordering assertions anchor on the
  // tier's own lookup (`SELECT m.category INTO v_cat`). Anchoring on the table name
  // compares against the SELECTOR and fails on correct code.
  const TIER_LOOKUP = 'SELECT m.category INTO v_cat';

  it('reads the provider mapping before infer_venue_category', () => {
    const body = fnBody();
    const srcTier = body.indexOf(TIER_LOOKUP);
    const infer = body.indexOf('public.infer_venue_category(');
    expect(srcTier).toBeGreaterThan(-1);
    expect(infer).toBeGreaterThan(srcTier);
  });

  it('reaches name inference only when the mapping declined', () => {
    const body = fnBody();
    const infer = body.indexOf('v_inf  := public.infer_venue_category(');
    const guard = body.lastIndexOf('IF v_cat IS NULL THEN', infer);
    expect(guard).toBeGreaterThan(-1);
    expect(infer - guard).toBeLessThan(200);
  });

  it('keeps the sole-source refuge-restrooms rule ahead of everything', () => {
    const body = fnBody();
    const refuge = body.indexOf("rec.source_slugs = ARRAY['refuge-restrooms']");
    expect(refuge).toBeGreaterThan(-1);
    expect(refuge).toBeLessThan(body.indexOf(TIER_LOOKUP));
  });

  it('only fires on a SINGLE provider category', () => {
    // Matching a category word anywhere in the tag list made "Foot Massages 4 Men" a
    // bar off a yelp grab bag of Boot Stores and Shoe Shine.
    const body = fnBody();
    expect(body).toContain('IF cardinality(rec.provider_cats) = 1 THEN');
  });

  it('records which provider tag decided, not just that one did', () => {
    const body = fnBody();
    expect(body).toContain("v_src  := 'source_tag:' || rec.provider_cats[1];");
  });
});

describe('the rejected families stay rejected', () => {
  it('does not map restaurants', () => {
    // ~17% of the 71 rows are a different venue type; two are not food venues at all.
    expect(mappingInsert()).not.toContain('restaurants');
  });

  it('does not map social service organizations or gay & lesbian bars', () => {
    const ins = mappingInsert();
    expect(ins).not.toContain('social service organizations');
    expect(ins).not.toContain('gay & lesbian bars');
  });

  it('maps exactly the three exhaustively-read families', () => {
    const ins = mappingInsert();
    expect(ins).toContain("('hotels','hotel'");
    expect(ins).toContain("('gastropub','bar'");
    expect(ins).toContain("('cafeteria','cafe'");
    // One row per tag. A fourth would be an unread family.
    expect(ins.match(/\n\s*\('/g)?.length).toEqual(3);
  });

  it('asserts no venue was categorised from a rejected tag', () => {
    const v = verify();
    expect(v).toContain("'source_tag:restaurants'");
    expect(v).toContain("'source_tag:social service organizations'");
    expect(v).toContain('P5 failed');
  });

  it('asserts the rejected tags are absent from the MAPPING, not only from the data', () => {
    // P5 alone passes on a fresh install where the tag was added and the cron has not
    // run yet — the data is clean because nothing has happened.
    const v = verify();
    const p5b = v.slice(v.indexOf('P5b'), v.indexOf('P5b') + 400);
    expect(v).toContain('P5b failed');
    const guard = v.slice(0, v.indexOf('P5b failed'));
    expect(guard).toContain('from public.venue_category_source_tags');
    expect(guard).toContain("provider_tag in ('restaurants'");
    expect(p5b.length).toBeGreaterThan(0);
  });
});

describe('noise removal is data and covers the absence case', () => {
  it("strips 'mixed', the token 4,445 rows carry to mean no category was supplied", () => {
    expect(noiseInsert()).toContain("('mixed')");
  });

  it('asserts no venue was categorised FROM a noise token', () => {
    const v = verify();
    expect(v).toContain("= 'source_tag:mixed'");
    expect(v).toContain('P4 failed');
  });

  it('keeps the noise list in a table rather than inline in the function', () => {
    const body = fnBody();
    expect(body).toContain('public.venue_category_source_tag_noise');
    expect(body).not.toContain("'mixed'");
  });
});

describe('the mapping cannot write a category the column rejects', () => {
  it('pins its CHECK to the 15 writable venue categories', () => {
    const ddl = between('create table if not exists public.venue_category_source_tags', ');');
    expect(ddl).toContain('venue_category_source_tags_category_check');
    // 'other' is a no-op and 'toilet' belongs to the refuge-restrooms rule.
    const check = ddl.slice(ddl.indexOf('venue_category_source_tags_category_check'));
    expect(check).not.toContain("'other'");
    expect(check).not.toContain("'toilet'");
    expect(check).toContain("'hotel'");
  });

  it('asserts the mapping and venues_category_check agree', () => {
    const v = verify();
    expect(v).toContain('P1 failed');
    expect(v).toContain('from public.venue_category_source_tags');
  });

  it('does not use normalize_venue_category as the validator', () => {
    // It is stale: maps cafe->restaurant, shop->other, cruising->other, and still emits
    // `organization`, which venues_category_check rejects.
    expect(sql).not.toContain('normalize_venue_category');
  });
});

describe('neither table is reachable by anon or authenticated', () => {
  it('enables RLS and revokes both roles on both tables', () => {
    for (const t of ['venue_category_source_tags', 'venue_category_source_tag_noise']) {
      expect(sql).toContain(`alter table public.${t} enable row level security`);
      expect(sql).toContain(`revoke all on public.${t} from anon, authenticated`);
      expect(sql).toContain(`grant select on public.${t} to service_role`);
    }
  });
});

describe('postconditions', () => {
  it('asserts the engine is alive rather than that it found nothing', () => {
    const v = verify();
    expect(v).toContain('P2 failed');
    expect(v).toContain("coalesce((v_res->>'examined')::int, -1) < 0");
  });

  it('asserts the tier actually fired', () => {
    const v = verify();
    expect(v).toContain('P3 failed');
    expect(v).toMatch(/if v_bad = 0 then\s*\n\s*raise exception 'P3 failed/);
  });

  it('asserts no mappable row is left stuck at other', () => {
    const v = verify();
    expect(v).toContain('P6 failed');
    expect(v).toMatch(/if v_bad <> 0 then\s*\n\s*raise exception 'P6 failed/);
  });

  it('pins no exact row count anywhere', () => {
    // The cohort moved 202 -> 205 between measuring and validating, so a total asserted
    // here fails on correct code the next time ingest adds a tripadvisor hotel.
    const v = verify();
    expect(v).not.toMatch(/v_bad (<>|!=) (1\d\d|2\d\d)\b/);
    expect(v).not.toMatch(/v_bad = (1\d\d|2\d\d)\b/);
  });

  it('drains on examined=0 rather than on a count, and is bounded', () => {
    const a = applyBlock();
    expect(a).toContain("exit when coalesce((v_res->>'examined')::int, 0) = 0 or v_pass >= 6");
  });

  it('keeps the batch at the 300-row search-trigger cap', () => {
    expect(applyBlock()).toContain('run_venue_category_reclassify(300, 0.85, false)');
    expect(fnBody()).toContain('LEAST(coalesce(p_batch, 300), 300)');
  });

  it('does not neuter its own checks', () => {
    const v = verify();
    expect(v).not.toMatch(/where false/i);
    expect(v).not.toMatch(/if false/i);
    // A pre-seeded counter makes every `if v_bad <> 0` vacuous.
    expect(v).not.toMatch(/v_bad\s+int\s*:=\s*0/);
  });
});
