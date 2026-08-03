// End-to-end check of the tag taxonomy work against PRODUCTION.
// Uses the public anon API the site itself uses, so it exercises the real
// RLS/grant path a visitor hits, not a service-role shortcut.
const URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY;
if (!KEY) { console.error('SUPABASE_ANON_KEY not set'); process.exit(2); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rpc(fn, body = {}) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function tbl(q) {
  const r = await fetch(`${URL}/rest/v1/${q}`, { headers: H });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

// 1. plural slugs resolve to their singular, the way the router asks
for (const [from, to] of [['pubs', 'pub'], ['gay-bars', 'gay-bar'], ['saunas', 'sauna'], ['breweries', 'brewery'], ['caf', 'cafe']]) {
  const r = await rpc('resolve_tag_slug', { p_slug: from });
  const row = Array.isArray(r.body) ? r.body[0] : r.body;
  check(`resolve /tags/${from} -> ${to}`, row?.slug === to, `got ${JSON.stringify(row) || r.status}`);
}

// 1b. multi-hop merge chains must land on the terminal canonical, not 404.
// A -> B -> C used to return nothing, because resolve_tag_slug hops once and
// filters the target on status='active'.
for (const [from, to] of [['nightclubs', 'night-club'], ['night-clubs', 'night-club'], ['femboyfemboi', 'femboy-femboi']]) {
  const r = await rpc('resolve_tag_slug', { p_slug: from });
  const row = Array.isArray(r.body) ? r.body[0] : r.body;
  check(`chain /tags/${from} -> ${to}`, row?.slug === to, `got ${JSON.stringify(row) || r.status}`);
}

// 2. merged plurals must no longer be live tags
const merged = await tbl('unified_tags?slug=in.(pubs,gay-bars,saunas)&status=eq.active&select=slug');
check('merged plurals not active', Array.isArray(merged.body) && merged.body.length === 0, JSON.stringify(merged.body));

// 3. the singulars are live
const sing = await tbl('unified_tags?slug=in.(pub,gay-bar,sauna)&status=eq.active&select=slug,usage_count');
check('singulars live (3)', Array.isArray(sing.body) && sing.body.length === 3, JSON.stringify(sing.body));

// 4. no diacritic-corrupted slug publicly reachable
const caf = await tbl('unified_tags?slug=eq.caf&status=eq.active&select=slug');
check('corrupted slug "caf" not active', Array.isArray(caf.body) && caf.body.length === 0, JSON.stringify(caf.body));
const cafe = await tbl('unified_tags?slug=eq.cafe&status=eq.active&select=slug,name');
check('cafe live', cafe.body?.[0]?.slug === 'cafe', JSON.stringify(cafe.body));

// 5. English enforcement
const mun = await tbl('unified_tags?slug=eq.munich&status=eq.active&select=slug,name');
check('Munchen -> Munich', mun.body?.[0]?.name === 'Munich', JSON.stringify(mun.body));
const curly = await tbl("unified_tags?name=like.*%E2%80%99*&select=slug&limit=1");
check('no curly apostrophes in names', Array.isArray(curly.body) && curly.body.length === 0, JSON.stringify(curly.body));

// 6. is_adult fixed at the cause
const facets = await tbl('unified_tags?slug=in.(mat-cotton,mat-gold,mat-silicone,vibe-sporty)&select=slug,is_adult');
const stillAdult = (facets.body ?? []).filter((t) => t.is_adult);
check('marketplace facets not is_adult', Array.isArray(facets.body) && facets.body.length === 4 && stillAdult.length === 0, JSON.stringify(stillAdult));

// 7. shadowing search-synonym rewrites gone
for (const term of ['restaurant', 'india', 'film']) {
  const syn = await tbl(`search_synonyms?terms=cs.{${term}}&select=terms,replacements`);
  const bad = Array.isArray(syn.body) ? syn.body : [];
  check(`no "${term}" shadow rewrite`, bad.length === 0, JSON.stringify(bad));
}

// 8. health snapshot hard zeros + proof the cron really ran
const h = await rpc('tag_vocabulary_health');
const V = h.body ?? {};
for (const k of ['plural_pairs_open', 'slug_corrupt', 'legacy_category_values', 'shadowing_aliases', 'stale_lexical_flags']) {
  check(`health ${k} == 0`, V[k] === 0, `${k}=${V[k]}`);
}
check('plural cron has succeeded at least once', !!V.plural_cron_last_success, `last=${V.plural_cron_last_success}`);

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '   <- ' + r.detail}`);
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
