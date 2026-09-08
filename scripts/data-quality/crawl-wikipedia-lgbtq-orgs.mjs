#!/usr/bin/env node
// crawl-wikipedia-lgbtq-orgs.mjs - Node 20, plain fetch, no deps.
//
// Produces out/lgbtq-political-orgs.json, the input to
// import-wikipedia-lgbtq-orgs.mjs. Re-run only to refresh the corpus; the
// output is committed so the import is reproducible without re-crawling.
// Design: docs/plans/2026-09-08-lgbtq-advocacy-org-import-design.md
// Crawls Wikipedia category trees for LGBTQ political advocacy groups,
// resolves Wikidata QIDs, and pulls P31/P17/P856/P571/P576 claims.

import { writeFile } from 'node:fs/promises';

const UA = 'QueerGuideResearch/1.0 (contact: tmaeder@me.com; research task, low volume)';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WD_API = 'https://www.wikidata.org/w/api.php';

const ROOTS = [
  'Category:LGBTQ political organizations',
  'Category:LGBTQ political advocacy groups',
  'Category:LGBTQ political advocacy groups by country',
  'Category:Defunct LGBTQ political advocacy groups',
  'Category:International LGBTQ political advocacy groups',
  'Category:LGBTQ political parties',
  'Category:LGBTQ affiliate organizations of political parties',
];

const MAX_DEPTH = 3;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJSON(url, { retries = 6 } = {}) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after')) || 0;
        const wait = Math.max(ra * 1000, 1000 * 2 ** attempt);
        console.error(`[429] backing off ${wait}ms :: ${url}`);
        await sleep(wait);
        if (attempt > retries) throw new Error('429 retries exhausted: ' + url);
        continue;
      }
      if (!res.ok) {
        if (res.status >= 500 && attempt <= retries) {
          const wait = 1000 * 2 ** attempt;
          console.error(`[${res.status}] retrying in ${wait}ms :: ${url}`);
          await sleep(wait);
          continue;
        }
        throw new Error(`HTTP ${res.status} :: ${url}`);
      }
      return await res.json();
    } catch (e) {
      if (attempt > retries) throw e;
      const wait = 1000 * 2 ** attempt;
      console.error(`[err ${e.message}] retrying in ${wait}ms :: ${url}`);
      await sleep(wait);
    }
  }
}

// ---------- category walk ----------

const categoryCache = new Map(); // title -> {pages:[{title}], subcats:[{title}]}

async function getCategoryMembers(categoryTitle) {
  if (categoryCache.has(categoryTitle)) return categoryCache.get(categoryTitle);
  const pages = [];
  const subcats = [];
  let cmcontinue = undefined;
  do {
    const params = new URLSearchParams({
      action: 'query',
      list: 'categorymembers',
      cmtitle: categoryTitle,
      cmtype: 'page|subcat',
      cmlimit: '500',
      format: 'json',
      formatversion: '2',
    });
    if (cmcontinue) params.set('cmcontinue', cmcontinue);
    const url = `${WIKI_API}?${params.toString()}`;
    const data = await fetchJSON(url);
    const members = data?.query?.categorymembers || [];
    for (const m of members) {
      if (m.ns === 14) subcats.push({ title: m.title });
      else if (m.ns === 0) pages.push({ title: m.title });
      // ignore other namespaces (templates, etc.)
    }
    cmcontinue = data?.continue?.cmcontinue;
    await sleep(60); // be polite
  } while (cmcontinue);
  const result = { pages, subcats };
  categoryCache.set(categoryTitle, result);
  return result;
}

function deriveCountryFromCategoryTitle(catTitle) {
  const name = catTitle.replace(/^Category:/, '');
  // "LGBTQ political advocacy groups in X" -> X
  let m = name.match(/^LGBTQ political advocacy groups in (.+)$/i);
  if (m) return m[1].trim();
  m = name.match(/^Defunct LGBTQ political advocacy groups in (.+)$/i);
  if (m) return m[1].trim();
  m = name.match(/^LGBTQ political parties in (.+)$/i);
  if (m) return m[1].trim();
  m = name.match(/^LGBTQ political organizations in (.+)$/i);
  if (m) return m[1].trim();
  return null;
}

// article title -> { paths: Set<string>, roots: Set<string>, countries: Set<string> }
const articles = new Map();
const rootArticleSets = new Map(); // root -> Set<title>
const categoriesVisitedGlobal = new Set();
const categoryDepthSeen = new Map(); // title -> min depth seen (for reporting)

function recordArticle(title, root, path, country) {
  let a = articles.get(title);
  if (!a) {
    a = { paths: new Set(), roots: new Set(), countries: new Set() };
    articles.set(title, a);
  }
  a.roots.add(root);
  if (a.paths.size < 6) a.paths.add(path.join(' > '));
  if (country) a.countries.add(country);

  if (!rootArticleSets.has(root)) rootArticleSets.set(root, new Set());
  rootArticleSets.get(root).add(title);
}

async function walkRoot(rootTitle) {
  const visited = new Set(); // per-root cycle guard
  const queue = [{ title: rootTitle, depth: 0, path: [rootTitle] }];
  let categoriesProcessed = 0;
  while (queue.length) {
    const { title, depth, path } = queue.shift();
    if (visited.has(title)) continue;
    visited.add(title);
    categoriesVisitedGlobal.add(title);
    const prevDepth = categoryDepthSeen.get(title);
    if (prevDepth === undefined || depth < prevDepth) categoryDepthSeen.set(title, depth);

    let members;
    try {
      members = await getCategoryMembers(title);
    } catch (e) {
      console.error(`FAILED category fetch ${title}: ${e.message}`);
      continue;
    }
    categoriesProcessed++;

    // derive country from this category node's own name, or fall back to any ancestor in path
    let country = deriveCountryFromCategoryTitle(title);
    if (!country) {
      for (let i = path.length - 1; i >= 0; i--) {
        const c = deriveCountryFromCategoryTitle(path[i]);
        if (c) { country = c; break; }
      }
    }

    for (const p of members.pages) {
      recordArticle(p.title, rootTitle, path, country);
    }

    if (depth < MAX_DEPTH) {
      for (const sc of members.subcats) {
        if (!visited.has(sc.title)) {
          queue.push({ title: sc.title, depth: depth + 1, path: [...path, sc.title] });
        }
      }
    }
  }
  console.error(`[root done] ${rootTitle} :: categories processed=${categoriesProcessed}, distinct articles=${rootArticleSets.get(rootTitle)?.size || 0}`);
}

// ---------- Wikidata QID resolution ----------

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function resolveQids(titles) {
  const titleToQid = new Map();
  const batches = chunk(titles, 50);
  let i = 0;
  for (const batch of batches) {
    i++;
    const params = new URLSearchParams({
      action: 'query',
      prop: 'pageprops',
      ppprop: 'wikibase_item',
      titles: batch.join('|'),
      format: 'json',
      formatversion: '2',
      redirects: '1',
    });
    const url = `${WIKI_API}?${params.toString()}`;
    const data = await fetchJSON(url);
    const pages = data?.query?.pages || [];
    // build redirect map: from -> to
    const redirectMap = new Map();
    for (const r of data?.query?.redirects || []) redirectMap.set(r.from, r.to);
    // build normalized map: from -> to
    const normMap = new Map();
    for (const n of data?.query?.normalized || []) normMap.set(n.from, n.to);

    const pageByFinalTitle = new Map();
    for (const p of pages) pageByFinalTitle.set(p.title, p);

    for (const origTitle of batch) {
      let cur = origTitle;
      if (normMap.has(cur)) cur = normMap.get(cur);
      if (redirectMap.has(cur)) cur = redirectMap.get(cur);
      const page = pageByFinalTitle.get(cur);
      const qid = page?.pageprops?.wikibase_item;
      if (qid) titleToQid.set(origTitle, qid);
    }
    console.error(`[qid batch ${i}/${batches.length}] resolved so far: ${titleToQid.size}`);
    await sleep(60);
  }
  return titleToQid;
}

// ---------- Wikidata entity fetch ----------

async function fetchEntities(qids) {
  const entityById = new Map();
  const batches = chunk(qids, 50);
  let i = 0;
  for (const batch of batches) {
    i++;
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: batch.join('|'),
      props: 'claims|labels|sitelinks',
      languages: 'en',
      format: 'json',
      formatversion: '2',
    });
    const url = `${WD_API}?${params.toString()}`;
    const data = await fetchJSON(url);
    const ents = data?.entities || {};
    for (const [id, ent] of Object.entries(ents)) {
      entityById.set(id, ent);
    }
    console.error(`[entity batch ${i}/${batches.length}] total entities: ${entityById.size}`);
    await sleep(60);
  }
  return entityById;
}

function getClaimValues(entity, prop) {
  const claims = entity?.claims?.[prop];
  if (!claims) return [];
  const out = [];
  for (const c of claims) {
    const mainsnak = c.mainsnak;
    if (!mainsnak || mainsnak.snaktype !== 'value') continue;
    const dv = mainsnak.datavalue;
    if (!dv) continue;
    if (dv.type === 'wikibase-entityid') out.push(dv.value.id);
    else if (dv.type === 'string') out.push(dv.value);
    else if (dv.type === 'time') out.push(dv.value.time);
    else out.push(JSON.stringify(dv.value));
  }
  return out;
}

// ---------- MAIN ----------

async function main() {
  console.error('=== STEP 1: crawling category trees ===');
  for (const root of ROOTS) {
    await walkRoot(root);
  }

  console.error(`\n=== category crawl summary ===`);
  console.error(`Distinct categories visited (all roots): ${categoriesVisitedGlobal.size}`);
  console.error(`Distinct articles found (all roots): ${articles.size}`);

  const allTitles = [...articles.keys()];

  console.error('\n=== STEP 2: resolving Wikidata QIDs ===');
  const titleToQid = await resolveQids(allTitles);
  console.error(`Resolved QIDs for ${titleToQid.size} / ${allTitles.length} articles`);

  const distinctQids = [...new Set(titleToQid.values())];
  console.error(`Distinct QIDs: ${distinctQids.length}`);

  console.error('\n=== STEP 3: fetching Wikidata entities ===');
  const entityById = await fetchEntities(distinctQids);

  // Collect P31 + P17 QIDs that need labels
  const labelNeeded = new Set();
  for (const ent of entityById.values()) {
    for (const q of getClaimValues(ent, 'P31')) labelNeeded.add(q);
    for (const q of getClaimValues(ent, 'P17')) labelNeeded.add(q);
  }
  console.error(`\n=== STEP 4: fetching labels for ${labelNeeded.size} P31/P17 QIDs ===`);
  const labelEntities = await fetchEntities([...labelNeeded]);
  const labelById = new Map();
  for (const [id, ent] of labelEntities.entries()) {
    labelById.set(id, ent?.labels?.en?.value || id);
  }

  // ---------- Build per-article record ----------
  const records = [];
  for (const [title, meta] of articles.entries()) {
    const qid = titleToQid.get(title) || null;
    const ent = qid ? entityById.get(qid) : null;
    const p31 = ent ? getClaimValues(ent, 'P31') : [];
    const p17 = ent ? getClaimValues(ent, 'P17') : [];
    const p856 = ent ? getClaimValues(ent, 'P856') : [];
    const p571 = ent ? getClaimValues(ent, 'P571') : [];
    const p576 = ent ? getClaimValues(ent, 'P576') : [];
    const p1448 = ent ? getClaimValues(ent, 'P1448') : [];
    const label = ent?.labels?.en?.value || null;
    records.push({
      title,
      roots: [...meta.roots],
      paths: [...meta.paths],
      categoryCountries: [...meta.countries],
      qid,
      wikidataLabel: label,
      p31,
      p31Labels: p31.map((q) => labelById.get(q) || q),
      p17,
      p17Labels: p17.map((q) => labelById.get(q) || q),
      p856,
      p571,
      p576,
      p1448,
    });
  }

  const outPath = new URL('./out/lgbtq-political-orgs.json', import.meta.url).pathname;
  await writeFile(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    roots: ROOTS,
    maxDepth: MAX_DEPTH,
    categoriesVisited: categoriesVisitedGlobal.size,
    distinctArticles: articles.size,
    rootCounts: Object.fromEntries([...rootArticleSets.entries()].map(([r, s]) => [r, s.size])),
    records,
  }, null, 2));
  console.error(`\nWrote ${outPath}`);
  console.error('DONE');
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
