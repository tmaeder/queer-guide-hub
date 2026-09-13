#!/usr/bin/env node
// fetch-wikipedia-org-extracts.mjs — lead-paragraph descriptions for the
// LGBTQ advocacy corpus.
//
// The crawl deliberately skips extracts (they cannot be batched with the
// category walk and would have tripled its runtime). Without them every new
// organization lands as a bare stub, and `organizations` already carries 2,541
// rows with neither description nor website — this import should not add ~350
// more.
//
// Output out/lgbtq-political-org-extracts.json is committed, so the import is
// reproducible without re-fetching.
//
// Usage: node scripts/data-quality/fetch-wikipedia-org-extracts.mjs

import { readFile, writeFile } from 'node:fs/promises';

const UA = 'QueerGuideResearch/1.0 (contact: tmaeder@me.com; low volume)';
const API = 'https://en.wikipedia.org/w/api.php';
const IN = new URL('./out/lgbtq-political-orgs.json', import.meta.url).pathname;
const OUT = new URL('./out/lgbtq-political-org-extracts.json', import.meta.url).pathname;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, attempt = 0) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(1000 * 2 ** attempt);
      return fetchJSON(url, attempt + 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (attempt < 5) {
      await sleep(1000 * 2 ** attempt);
      return fetchJSON(url, attempt + 1);
    }
    throw e;
  }
}

/**
 * The first sentence or two, capped. `exintro` + `explaintext` give the lead
 * section as plain text; anything past ~400 chars is article body, not a
 * directory blurb.
 */
function trimExtract(text) {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (clean.length <= 400) return clean;
  // Cut at a sentence boundary rather than mid-word.
  const cut = clean.slice(0, 400);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return stop > 150 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
}

const corpus = JSON.parse(await readFile(IN, 'utf8'));
const titles = [...new Set(corpus.records.map((r) => r.title))];
console.log(`fetching extracts for ${titles.length} titles`);

const out = {};
for (let i = 0; i < titles.length; i += 20) {
  const batch = titles.slice(i, i + 20);
  const url =
    `${API}?action=query&format=json&formatversion=2&redirects=1` +
    `&prop=extracts&exintro=1&explaintext=1&exlimit=20` +
    `&titles=${encodeURIComponent(batch.join('|'))}`;
  const json = await fetchJSON(url);

  // `redirects=1` rewrites requested titles to their targets, so map back or the
  // four redirect pages in this corpus would silently get no extract.
  const alias = new Map((json.query?.redirects ?? []).map((r) => [r.to, r.from]));
  for (const page of json.query?.pages ?? []) {
    const extract = trimExtract(page.extract);
    if (!extract) continue;
    out[page.title] = extract;
    if (alias.has(page.title)) out[alias.get(page.title)] = extract;
  }
  process.stdout.write(`\r  ${Math.min(i + 20, titles.length)}/${titles.length}`);
  await sleep(150);
}

console.log(`\nresolved ${Object.keys(out).length} / ${titles.length}`);
await writeFile(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${OUT}`);
