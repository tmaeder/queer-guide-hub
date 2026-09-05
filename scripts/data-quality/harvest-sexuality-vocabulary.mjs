#!/usr/bin/env node
/**
 * Harvest the candidate term list for the BDSM / sexuality / LGBTQ glossary
 * import, and classify every candidate BEFORE anything is written anywhere.
 *
 * A WIKIPEDIA CATEGORY IS A CANDIDATE LIST, NOT AN IMPORT LIST. This is the
 * whole reason this script exists rather than a loop that inserts category
 * members. Measured while scoping:
 *
 *   Category:Anal eroticism    contains "Bloom (Troye Sivan song)"
 *   Category:Sexual fetishism  contains "Jerry Brudos" (a serial killer),
 *                              "Kink.com", "2 Girls 1 Cup"
 *   Category:Fetish subculture contains "FetLife", "Recon (app)",
 *                              "International Mr. Leather", "Maria Beatty"
 *   Category:Mating            contains "Mating of gastropods",
 *                              "Fruitless (gene)", "Animal weapon"
 *
 * Importing those creates exactly the kind mismatch the 2026-08-29 taxonomy
 * rebuild spent itself undoing — Berlin filed under History & Heritage, Spandex
 * under Expression — one vocabulary later.
 *
 * OUTPUT is scripts/data-quality/out/sexuality-vocabulary-candidates.json: one
 * row per candidate with a disposition and a REASON. It is committed, and it is
 * the reviewable artifact — nothing is imported that is not in it, and a human
 * can correct a disposition without rerunning anything.
 *
 * DISPOSITIONS
 *   import   a glossary-worthy concept
 *   critique a term that belongs in the glossary but NOT as neutral kink or
 *            identity vocabulary — racial fetishisation, slurs, discredited
 *            clinical theories. Routed to Violence & Hate / Trans Health /
 *            Politics & Activism with the framing stated in the definition,
 *            never to Fetishes, which would file racism as a kink.
 *   reject   not a glossary concept: a person, work, company, organisation,
 *            recurring event, or non-human biology
 *
 * Matching against `unified_tags` is a SEPARATE step (--match), because it needs
 * credentials and this half deliberately does not: harvest is reproducible by
 * anyone, and the cache makes a re-run free. The match step FAILS CLOSED — with
 * no key it reports that it could not look rather than reporting a clean tree,
 * the same rule as check-migration-versions.mjs.
 *
 * WIKIPEDIA RATE-LIMITS THIS. A naive sweep drew HTTP 429 twice during scoping.
 * Every response is cached on disk, requests are throttled and 429/5xx backs
 * off, so the script is built to be stopped and resumed and a re-run costs only
 * the new tail — the same discipline as generate-city-transit-lines.mjs.
 *
 * Usage:
 *   node scripts/data-quality/harvest-sexuality-vocabulary.mjs            # harvest + classify
 *   node scripts/data-quality/harvest-sexuality-vocabulary.mjs --cached-only
 *   node scripts/data-quality/harvest-sexuality-vocabulary.mjs --match    # needs SUPABASE_SERVICE_ROLE_KEY
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, 'cache', 'wikipedia');
const OUT = join(HERE, 'out');
const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'queer.guide glossary harvest (https://queer.guide; contact via repo)';

const CACHED_ONLY = process.argv.includes('--cached-only');
const MATCH = process.argv.includes('--match');

mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

/** Plain articles harvested directly (not categories). */
export const PAGES = [
  'Glossary of BDSM',
  'List of BDSM equipment',
  'Bondage positions and methods',
  'Outline of BDSM',
  'Discipline (BDSM)',
  'Master/slave (BDSM)',
  'Erotic humiliation',
  'Drag Race terminology',
];

/**
 * Categories to sweep, with depth-1 subcategory expansion.
 *
 * `weight` records how much of the category is expected to survive the filter,
 * measured during scoping. It does not gate anything — it is here so a future
 * reader can tell a category that yielded nothing because it is off-topic from
 * one that yielded nothing because the sweep broke.
 */
export const CATEGORIES = [
  // Closest fit: this is the vocabulary the platform already publishes.
  { name: 'LGBTQ slang', weight: 'high' },
  { name: 'LGBTQ terminology', weight: 'high' },
  { name: 'LGBTQ linguistics', weight: 'high' },
  { name: 'LGBTQ and society', weight: 'medium' },
  { name: 'LGBTQ', weight: 'low' },
  { name: 'Sexuality and gender identity-based cultures', weight: 'medium' },
  // Kink and sexual practice.
  { name: 'Sexual acts', weight: 'high' },
  { name: 'Sexual fetishism', weight: 'high' },
  { name: 'Fetish subculture', weight: 'medium' },
  { name: 'Sexual attraction', weight: 'medium' },
  { name: 'Sexuality', weight: 'medium' },
  // Mostly biology. Kept in scope per the explicit decision to sweep all
  // sources and filter hard per row, NOT because they are expected to yield.
  // Measured: Category:Mating is zoology (Amplexus, Mating of gastropods),
  // Category:Sexual reproduction is cell biology (Gametangiogamy, Gynogenesis),
  // Category:Sex is largely genetics (Female sperm, Sex linkage).
  { name: 'Sex', weight: 'low' },
  { name: 'Mating', weight: 'none' },
  { name: 'Sexual reproduction', weight: 'none' },
];

// ── Fetch with disk cache, throttle and backoff ─────────────────────────────
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const qs = new URLSearchParams({ ...params, action: 'query', format: 'json', formatversion: '2' });
  const url = `${API}?${qs}`;
  const key = createHash('sha1').update(url).digest('hex');
  const path = join(CACHE, `${key}.json`);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  if (CACHED_ONLY) throw new Error(`--cached-only but not cached: ${url}`);

  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = Math.max(0, 1100 - (Date.now() - lastCall));
    if (wait) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) {
      // A busy upstream is not our failure — back off and ask again. Only a
      // persistent refusal is an error.
      const backoff = 4000 * 2 ** attempt;
      process.stderr.write(`  ${res.status}; retrying in ${backoff / 1000}s\n`);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const body = await res.json();
    writeFileSync(path, JSON.stringify(body), 'utf8');
    return body;
  }
  throw new Error(`gave up after 5 attempts: ${url}`);
}

async function categoryMembers(title, type) {
  const out = [];
  let cont;
  do {
    const body = await api({
      list: 'categorymembers',
      cmtitle: `Category:${title}`,
      cmlimit: '500',
      cmtype: type,
      ...(cont ? { cmcontinue: cont } : {}),
    });
    for (const m of body?.query?.categorymembers ?? []) out.push(m.title);
    cont = body?.continue?.cmcontinue;
  } while (cont);
  return out;
}

/** Article metadata in batches of 50 — the API's limit for a titles= query. */
async function pageMeta(titles) {
  const meta = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const body = await api({
      titles: batch.join('|'),
      prop: 'categories|pageprops',
      cllimit: 'max',
      clshow: '!hidden',
      ppprop: 'wikibase_item|disambiguation',
    });
    for (const p of body?.query?.pages ?? []) {
      meta.set(p.title, {
        cats: (p.categories ?? []).map((c) => c.title.replace(/^Category:/, '')),
        qid: p.pageprops?.wikibase_item ?? null,
        disambiguation: p.pageprops?.disambiguation !== undefined,
        missing: p.missing === true,
      });
    }
  }
  return meta;
}

// ── Classification ──────────────────────────────────────────────────────────

/**
 * Rejection rules, applied in order. Each is keyed on the article's OWN
 * categories, which is the cheapest signal that actually separates a concept
 * from a person or a product — far more reliable on this corpus than the title.
 */
const REJECT_RULES = [
  [/^(Living people|\d{4} births|\d{4} deaths)$/i, 'person'],
  [/(births|deaths|people|actors|actresses|writers|directors|musicians|models|photographers|pornographic film|drag queens|activists|singers|rappers|artists)\b/i, 'person'],
  [/(albums?|songs?|singles|films?|television|TV series|episodes|novels?|books?|magazines?|manga|anime|video games?|webcomics|documentaries|plays)\b/i, 'work'],
  [/(companies|corporations|brands|websites|web ?sites|online (retail|dating)|software|mobile applications|apps|social networking|record labels|publishers)\b/i, 'company'],
  [/(organizations?|organisations?|charities|non-?profit|associations|clubs established|advocacy groups|political parties|trade unions)\b/i, 'organisation'],
  [/(festivals?|events? established|conventions?|awards?|competitions?|pageants?|parades?|contests?|conferences)\b/i, 'event'],
  // `animal[a-z ]*behaviou?r` rather than `animal behaviou?r`: the real category
  // is "Animal sexual behaviour", with a word in between, so the tighter form
  // matched nothing and let "Sexual behavior of kangaroos" and "Mating of
  // gastropods" through as importable glossary terms.
  [/(zoology|entomology|botany|ethology|animal[a-z ]*(behaviou?r|anatomy|sexuality)|plant (sexuality|reproduction)|genetics|molecular biology|evolutionary biology|cell biology|fungi|arthropod|insect|mollusc|gastropod|marsupial|mammal|bird|fish|reptile|amphibian|genes? |mycology|reproduction in|ornithology|sexual selection)\b/i, 'non-human biology'],
  [/(buildings|venues in|bars in|nightclubs in|restaurants in|populated places|cities|neighbou?rhoods|streets in)\b/i, 'place'],
];

/**
 * Terms that belong in the glossary but must NOT be filed as neutral kink or
 * identity vocabulary. Matched on the TITLE, because the category tree files
 * these beside ordinary fetishes and cannot distinguish them.
 *
 * Racial and body fetishisation is objectification, not a kink; a discredited
 * clinical typology is a thing trans readers encounter and need context for,
 * not a diagnosis; a slur belongs in a glossary precisely so a reader can look
 * it up, but never presented as a neutral synonym.
 */
const CRITIQUE_RULES = [
  [/blanchard|autogynephilia|courtship disorder|transsexualism typology/i, 'trans-health', 'discredited clinical theory — needs its status stated'],
  [/asian fetish|ethnic pornography|race and sexuality|racial fetish|rice queen|dinge queen|jungle fever/i, 'violence-hate', 'racial fetishisation is objectification, not a kink'],
  [/fetishi[sz]ation of|objectification/i, 'violence-hate', 'names a harm done to a group'],
  [/\bslur\b|faggot|dyke \(slang\)|tranny|shemale|ladyboy/i, 'violence-hate', 'slur — glossary entry must say so'],
  [/conversion therapy|ex-gay/i, 'violence-hate', 'discredited and harmful practice'],
];

/**
 * Wikidata P31 classes that mean "this article is ABOUT a topic" rather than
 * "this is a term a reader would look up in a glossary".
 *
 * THE CATEGORY FILTER ALONE IS NOT ENOUGH, and a 152-row stratified sample of
 * its output is what proved it. The category rules separate entity KINDS
 * cleanly — person, work, company, organisation, event, place, non-human
 * biology, 1,059 rejects — but they are blind to the article/term axis, so the
 * first pass admitted "Acteon pelecais" (a sea slug), "Catgirl Manor" (a video
 * game), "Powell v. State" (a court case), "Chair in Transgender Studies at the
 * University of Victoria", "Sexual behavior of kangaroos", "Blood donation
 * restrictions on men who have sex with men", "LGBTQ rights in Egypt" and
 * "Follicular phase" alongside genuine vocabulary like "Femminiello",
 * "Two-spirit", "Lipstick lesbian" and "Masculine of center".
 *
 * P31 is the discriminator the class arm of tag-wiki-guard.ts already trusts,
 * and every candidate carries a QID from the metadata pass, so this costs one
 * batched wbgetentities call per 50 rows and no extra page fetches.
 *
 * Rights-by-country and law articles are rejected specifically because the
 * platform already models that: `countries.lgbti_criminalization`, the ILGA
 * ledger and /rights are the surface for them, not a glossary tag.
 */
const REJECT_P31 = [
  /\b(taxon|species|genus|clade|monotypic)\b/i,
  /\b(chemical compound|chemical substance|steroid|hormone|protein|gene|enzyme|drug class)\b/i,
  /\b(video game|film|television series|album|song|single|book|novel|manga|comic|periodical|journal|newspaper|website|web series|painting|sculpture|musical work)\b/i,
  /\b(human|fictional (human|character)|given name|family name|surname)\b/i,
  /\b(business|enterprise|company|brand|organization|organisation|nonprofit|university|school|academic chair|professorship|museum|library)\b/i,
  /\b(court case|legal case|lawsuit|legislation|act of parliament|bill|statute|treaty|law of|constitutional amendment)\b/i,
  /\b(aspect of|history of|overview article|list|wikimedia (list|disambiguation|category)|encyclopedic article)\b/i,
  /\b(anatomical structure|body part|organ|tissue|cell type|disease|syndrome|medical (procedure|specialty)|phase|menstrual)\b/i,
  /\b(war|battle|massacre|murder|crime|criminal (case|act)|terrorist attack|riot|protest|demonstration)\b/i,
  /\b(geographic (region|location)|city|country|state|province|neighborhood|district|building|street)\b/i,
  /\b(mytholog|deity|legendary (creature|figure)|folklore (character|motif))/i,
  /\b(recurring event|festival|convention|competition|award|conference|sports season)\b/i,
];

/**
 * P31 classes that positively CONFIRM a glossary term, overriding a reject
 * above. Needed because Wikidata files a lot of real vocabulary under classes
 * that also match a reject pattern — "sexual orientation" is an "aspect of
 * human sexuality", and several kink practices are typed as a "medical
 * procedure" or a "disease" by clinical editors.
 */
const KEEP_P31 =
  /\b(concept|term|slang|neologism|idiom|phrase|jargon|sexual (practice|orientation|identity|role|position|behaviou?r)|paraphilia|fetish|kink|gender identity|social (practice|phenomenon|group)|subculture|community|euphemism|pejorative|slur|ethnic slur|LGBT|honorific|title)\b/i;

export function classifyP31(labels) {
  if (!labels || labels.length === 0) return null; // no evidence — leave the category verdict alone
  const joined = labels.join('; ');
  if (KEEP_P31.test(joined)) return null;
  for (const re of REJECT_P31) {
    const m = re.exec(joined);
    if (m) return `not a glossary term (Wikidata class: ${m[0]})`;
  }
  return null;
}

export function classify(title, meta) {
  if (!meta || meta.missing) return { disposition: 'reject', reason: 'article does not exist' };
  if (meta.disambiguation) return { disposition: 'reject', reason: 'disambiguation page' };
  if (/^(List of|Outline of|Index of|Timeline of|Category:|Template:|Portal:|Wikipedia:)/i.test(title))
    return { disposition: 'reject', reason: 'index or meta page' };
  // A parenthetical qualifier naming a work or a person is decisive on its own.
  if (/\((song|album|film|band|TV series|novel|book|magazine|video game|app|company|surname|given name)\)$/i.test(title))
    return { disposition: 'reject', reason: 'title qualifier names a work, product or name' };

  for (const [re, cat, why] of CRITIQUE_RULES) {
    if (re.test(title)) return { disposition: 'critique', targetCategory: cat, reason: why };
  }

  // Title SHAPE — the third arm, and the one that catches what the other two
  // structurally cannot: an encyclopedia article about a topic, whose entity
  // kind is fine and whose Wikidata class is generic. Measured against the
  // known-good set, every genuine term in this corpus is 1-3 words
  // (Femminiello, Two-spirit, Lipstick lesbian, Masculine of center, Bareback
  // sex, Gay chicken, Poppers), while the over-admissions are long descriptive
  // titles ("Blood donation restrictions on men who have sex with men",
  // "Chair in Transgender Studies at the University of Victoria") or carry a
  // proper noun after a preposition ("LGBTQ rights in Egypt", "Mating of
  // gastropods", "Sexual behavior of kangaroos").
  //
  // The 5-word ceiling is deliberately generous — "Risk-aware consensual kink"
  // and "Topping from the bottom" are real entries — and this arm never
  // rejects outright. It downgrades to `review`, because "The love that dare
  // not speak its name" is a genuine glossary term with eight words, and a
  // rule that cannot tell it from a policy article must hand that judgement to
  // a person rather than make it silently.
  const words = title.split(/\s+/).length;
  if (words >= 6) return { disposition: 'review', reason: `long descriptive title (${words} words)` };
  if (/\s(in|of|by|at|from)\s+[A-Z]/.test(title))
    return { disposition: 'review', reason: 'proper noun after a preposition — reads as an article about a place or institution' };

  for (const cat of meta.cats) {
    for (const [re, why] of REJECT_RULES) {
      if (re.test(cat)) return { disposition: 'reject', reason: `${why} (category: ${cat})` };
    }
  }
  return { disposition: 'import', reason: 'concept' };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function harvest() {
  /** @type {Map<string, Set<string>>} title -> which sources produced it */
  const found = new Map();
  const add = (title, src) => {
    if (!found.has(title)) found.set(title, new Set());
    found.get(title).add(src);
  };

  for (const p of PAGES) add(p, 'page');

  for (const { name } of CATEGORIES) {
    process.stderr.write(`category: ${name}\n`);
    for (const t of await categoryMembers(name, 'page')) add(t, `Category:${name}`);
    const subs = await categoryMembers(name, 'subcat');
    for (const sub of subs) {
      const clean = sub.replace(/^Category:/, '');
      process.stderr.write(`  subcat: ${clean}\n`);
      for (const t of await categoryMembers(clean, 'page')) add(t, `Category:${clean}`);
    }
  }

  const titles = [...found.keys()].filter((t) => !/^Category:/.test(t)).sort();
  process.stderr.write(`\n${titles.length} distinct titles; fetching metadata\n`);
  const meta = await pageMeta(titles);

  let rows = titles.map((title) => {
    const m = meta.get(title);
    const c = classify(title, m);
    return {
      title,
      sources: [...found.get(title)].sort(),
      qid: m?.qid ?? null,
      ...c,
      // Filled by --match. `null` means NOT LOOKED, which is a different
      // answer from "absent" and must never be read as one.
      existing: null,
    };
  });

  // Second arm: Wikidata P31 on everything the category rules admitted. See the
  // note above REJECT_P31 — the category rules cannot see the article/term axis.
  const needP31 = rows.filter((r) => r.disposition === 'import' && r.qid).map((r) => r.qid);
  process.stderr.write(`fetching P31 for ${needP31.length} candidates\n`);
  const p31 = new Map();
  for (let i = 0; i < needP31.length; i += 50) {
    const ids = needP31.slice(i, i + 50).join('|');
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims&format=json`;
    const key = createHash('sha1').update(url).digest('hex');
    const path = join(CACHE, `${key}.json`);
    let body;
    if (existsSync(path)) body = JSON.parse(readFileSync(path, 'utf8'));
    else {
      // A cache miss under --cached-only must FAIL, never skip. Skipping
      // silently reclassifies every row in the batch as if it had no Wikidata
      // class — measured: a --cached-only re-run after a rule change moved 274
      // rows from reject to import and reported the smaller number as though it
      // were the answer.
      if (CACHED_ONLY) throw new Error(`--cached-only but P31 batch not cached: ${ids.slice(0, 60)}...`);
      const wait = Math.max(0, 1100 - (Date.now() - lastCall));
      if (wait) await sleep(wait);
      lastCall = Date.now();
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) {
        throw new Error(`P31 batch HTTP ${res.status} — refusing to classify on partial evidence`);
      }
      body = await res.json();
      writeFileSync(path, JSON.stringify(body), 'utf8');
    }
    for (const [qid, ent] of Object.entries(body.entities ?? {})) {
      const targets = (ent.claims?.P31 ?? [])
        .map((c) => c.mainsnak?.datavalue?.value?.id)
        .filter(Boolean);
      p31.set(qid, targets);
    }
  }
  // Resolve the P31 target QIDs to labels, batched the same way.
  const allTargets = [...new Set([...p31.values()].flat())];
  const labelOf = new Map();
  for (let i = 0; i < allTargets.length; i += 50) {
    const ids = allTargets.slice(i, i + 50).join('|');
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=labels&languages=en&format=json`;
    const key = createHash('sha1').update(url).digest('hex');
    const path = join(CACHE, `${key}.json`);
    let body;
    if (existsSync(path)) body = JSON.parse(readFileSync(path, 'utf8'));
    else {
      if (CACHED_ONLY) throw new Error(`--cached-only but P31 label batch not cached`);
      const wait = Math.max(0, 1100 - (Date.now() - lastCall));
      if (wait) await sleep(wait);
      lastCall = Date.now();
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`P31 label batch HTTP ${res.status}`);
      body = await res.json();
      writeFileSync(path, JSON.stringify(body), 'utf8');
    }
    for (const [qid, ent] of Object.entries(body.entities ?? {}))
      labelOf.set(qid, ent.labels?.en?.value ?? '');
  }
  rows = rows.map((r) => {
    if (r.disposition !== 'import' || !r.qid) return r;
    const labels = (p31.get(r.qid) ?? []).map((t) => labelOf.get(t)).filter(Boolean);
    const verdict = classifyP31(labels);
    return verdict
      ? { ...r, disposition: 'reject', reason: verdict, p31: labels }
      : { ...r, p31: labels };
  });

  const summary = rows.reduce((a, r) => ((a[r.disposition] = (a[r.disposition] ?? 0) + 1), a), {});
  const out = {
    generatedFrom: { pages: PAGES, categories: CATEGORIES.map((c) => c.name), depth: 1 },
    summary: { total: rows.length, ...summary },
    matched: false,
    rows,
  };
  const path = join(OUT, 'sexuality-vocabulary-candidates.json');
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  process.stderr.write(`\nwrote ${path}\n`);
  console.log(JSON.stringify(out.summary, null, 2));
}

async function match() {
  const url = process.env.SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    // Fail closed. "No credentials" is not "nothing already exists" — reporting
    // a clean tree here would send every already-present term to the import
    // list and create a second row for each.
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set — cannot check what already exists.');
    console.error('Refusing to report an unmatched candidate list as if it were matched.');
    process.exit(2);
  }
  const path = join(OUT, 'sexuality-vocabulary-candidates.json');
  const doc = JSON.parse(readFileSync(path, 'utf8'));

  const norm = (s) => s.toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').replace(/[^a-z0-9]/g, '');
  const get = async (p) => {
    const r = await fetch(`${url}/rest/v1/${p}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
    return r.json();
  };

  const byKey = new Map();
  for (let from = 0; ; from += 1000) {
    const page = await get(
      `unified_tags?select=slug,name,status&order=slug&offset=${from}&limit=1000`,
    );
    for (const t of page) {
      for (const k of [norm(t.name), norm(t.slug)]) {
        if (!byKey.has(k)) byKey.set(k, `${t.slug} [${t.status}]`);
      }
    }
    if (page.length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const page = await get(
      `tag_aliases?select=alias_name,canonical_tag_id,unified_tags(slug,status)&order=alias_slug&offset=${from}&limit=1000`,
    );
    for (const a of page) {
      const k = norm(a.alias_name);
      if (!byKey.has(k) && a.unified_tags)
        byKey.set(k, `alias -> ${a.unified_tags.slug} [${a.unified_tags.status}]`);
    }
    if (page.length < 1000) break;
  }

  let present = 0;
  for (const row of doc.rows) {
    row.existing = byKey.get(norm(row.title)) ?? false;
    if (row.existing) present += 1;
  }
  doc.matched = true;
  doc.summary.alreadyPresent = present;
  doc.summary.trulyAbsentImports = doc.rows.filter(
    (r) => r.disposition === 'import' && !r.existing,
  ).length;
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(doc.summary, null, 2));
}

if (MATCH) await match();
else await harvest();
