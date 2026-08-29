#!/usr/bin/env node
/**
 * Find tags whose `wikidata_id` points at a DIFFERENT SUBJECT than the tag.
 *
 * THE DEFECT
 *
 * `unified_tags.wikidata_id` is the source the prose was derived from, so a
 * wrong QID does not merely mislabel the row — it produces a confidently
 * written, well-formed body about an unrelated subject. Measured live:
 *
 *   passing   -> "Death is the irreversible cessation of biological functions"
 *   seafood   -> "COVID-19 is a contagious disease caused by SARS-CoV-2"
 *   gagging   -> "A gag order is a legal order by a court"
 *   siren     -> "The SIRENE is a French register of companies"
 *   amateur   -> "Indianapolis is the capital ... of Indiana"       (Q6346)
 *   bingo     -> "Bingo is a fictional character ... from Bluey"    (Q113647637)
 *
 * `passing` is a core trans concept and its page describes death. These are
 * live and indexable.
 *
 * WHY A TEXT HEURISTIC IS NOT ENOUGH
 *
 * The obvious test — "the body never names the tag" — selects 322 rows and is
 * only ~39% precise, because a correct definition legitimately paraphrases
 * ("Sexually Fluid" -> "Sexual fluidity refers to..."). Acting on that set would
 * retract ~200 correct bodies.
 *
 * THE EXACT TEST
 *
 * Ask Wikidata what the QID actually IS. If the entity's own label and aliases
 * bear no relation to the tag's name, the identifier is wrong — and that is a
 * fact about the identifier, not a judgement about the prose. Comparison is
 * done on normalized forms and accepts a label that CONTAINS or is CONTAINED BY
 * the tag name, so "Sexually Fluid" vs "sexual fluidity" passes on the stem
 * while "Amateur" vs "Indianapolis" cannot.
 *
 * The script only REPORTS. It writes no rows: the remedy (clear the QID and the
 * prose it sourced, vs. repoint it at the right entity) is a per-row decision.
 *
 * Usage:
 *   SUPABASE_ANON_KEY=... node scripts/data-quality/find-tag-wikidata-chimeras.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out', 'tag-wikidata-chimeras.json');

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY required');
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Cheap stem so "fluid"/"fluidity" and "fetish"/"fetishism" agree. */
const stem = (w) => w.replace(/(ity|ism|ing|ness|es|s)$/, '');
const stemAll = (s) => norm(s).split(' ').map(stem).filter(Boolean).join(' ');

/**
 * True when the entity's own LABEL plausibly IS the tag's subject.
 *
 * ALIASES ARE DELIBERATELY EXCLUDED, and a token-overlap rule was removed.
 * Both were tried and both produce FALSE NEGATIVES on the worst rows:
 *
 *   passing -> Q4 (death). "passing" is a real English alias of death, so an
 *   alias check accepts it — while the tag means the trans sense and the page
 *   published "Death is the irreversible cessation of biological functions".
 *
 *   seafood -> Q84263196 (COVID-19), whose aliases include "Wuhan SEAFOOD
 *   market pneumonia virus", so a shared->=4-char-token rule accepted it too.
 *
 * The label alone is the honest question: is this entity, by its own primary
 * name, the thing the tag is about?
 */
function labelMatches(tagName, label) {
  const t = stemAll(tagName);
  const c = stemAll(label || '');
  if (!t || !c) return true; // cannot judge -> never accuse
  return c === t || c.includes(t) || t.includes(c);
}

/**
 * True when the published prose names the tag itself.
 *
 * A correct definition almost always restates its term ("Algolagnia, also known
 * as sadomasochism, ..."), which is what keeps legitimate synonym QIDs out of
 * the result: algolagnia's QID is labelled "sadomasochism" and would fail the
 * label test alone, but its body says "Algolagnia" in the first three words.
 */
function bodyNamesTag(tagName, body) {
  const t = stemAll(tagName);
  const b = stemAll(body || '');
  if (!t || !b) return false;
  return b.includes(t);
}

async function pageAll(url) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${url}&limit=1000&offset=${offset}`, { headers: H });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function main() {
  const tags = await pageAll(
    `https://xqeacpakadqfxjxjcewc.supabase.co/rest/v1/unified_tags` +
      `?select=slug,name,wikidata_id,description,long_description,seo_indexable,entity_kind` +
      `&status=eq.active&wikidata_id=not.is.null&order=slug.asc`,
  );
  console.error(`${tags.length} active tags carry a wikidata_id`);

  // Batched label lookup. 50 ids per call is the wbgetentities maximum.
  const labels = new Map();
  let unjudged = 0;
  const ids = [...new Set(tags.map((t) => t.wikidata_id))];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url =
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*` +
      `&props=labels|aliases&languages=en|de&ids=${chunk.join('|')}`;
    // Wikidata 429s a fast sweep. Retry with backoff rather than skipping: a
    // skipped chunk is 50 rows we cannot judge, and the first run of this
    // script resolved only 500 of 2,021 ids for exactly that reason. The UA is
    // descriptive because the API's policy requires it and anonymous UAs are
    // throttled harder.
    let j = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'queer.guide-tag-audit/1.0 (https://queer.guide; ops@queer.guide)' },
      });
      if (r.ok) {
        j = await r.json();
        break;
      }
      const wait = r.status === 429 ? 5000 * (attempt + 1) : 1500 * (attempt + 1);
      console.error(`  HTTP ${r.status} on chunk ${i}, retry ${attempt + 1}/5 in ${wait}ms`);
      await new Promise((s) => setTimeout(s, wait));
    }
    if (!j) {
      // Still no answer: record it as UNJUDGED so the summary cannot read as
      // "these are all fine". Never as a mismatch.
      unjudged += chunk.length;
      console.error(`  chunk ${i} UNJUDGED after 5 attempts`);
      continue;
    }
    for (const [qid, ent] of Object.entries(j.entities || {})) {
      if (ent.missing !== undefined) {
        labels.set(qid, { missing: true, all: [] });
        continue;
      }
      const all = [
        ...Object.values(ent.labels || {}).map((l) => l.value),
        ...Object.values(ent.aliases || {}).flat().map((a) => a.value),
      ];
      labels.set(qid, { missing: false, all });
    }
    process.stderr.write(`  labels ${Math.min(i + 50, ids.length)}/${ids.length}\n`);
    await new Promise((s) => setTimeout(s, 1200));
  }

  // A row is a chimera only when BOTH signals agree. Either alone is wrong:
  //   label-only  flags algolagnia (QID labelled "sadomasochism") whose body is
  //               correct — ~20 of 47 in the first run were this false positive.
  //   body-only   selects 322 rows at ~39% precision, because a correct
  //               definition legitimately paraphrases its term.
  // The intersection asks: does the identifier point somewhere else, AND did
  // the prose follow it there? That is the actual published defect.
  const rows = [];
  for (const t of tags) {
    const e = labels.get(t.wikidata_id);
    if (!e) continue; // no answer is NOT evidence of a mismatch
    const body = `${t.description || ''} ${t.long_description || ''}`;
    if (e.missing) {
      rows.push({ ...pick(t), verdict: 'qid_missing', label: null });
      continue;
    }
    const label = e.all[0] || null;
    if (!labelMatches(t.name, label) && !bodyNamesTag(t.name, body)) {
      rows.push({ ...pick(t), verdict: 'chimera', label });
    }
  }

  const summary = {
    tags_with_qid: tags.length,
    distinct_qids: ids.length,
    labels_resolved: labels.size,
    unjudged_ids: unjudged,
    chimera: rows.filter((r) => r.verdict === 'chimera').length,
    qid_missing: rows.filter((r) => r.verdict === 'qid_missing').length,
    chimera_indexable: rows.filter((r) => r.verdict === 'chimera' && r.seo_indexable).length,
    chimera_with_prose: rows.filter(
      (r) => r.verdict === 'chimera' && (r.hasDescription || r.hasLongDescription),
    ).length,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ _summary: summary, rows }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

const pick = (t) => ({
  slug: t.slug,
  name: t.name,
  wikidata_id: t.wikidata_id,
  entity_kind: t.entity_kind,
  seo_indexable: t.seo_indexable,
  hasDescription: !!(t.description || '').trim(),
  hasLongDescription: !!(t.long_description || '').trim(),
  bodyLead: (t.long_description || t.description || '').slice(0, 110),
});

main().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
