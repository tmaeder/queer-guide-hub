#!/usr/bin/env node
// Enrich personalities that ALREADY have a wikidata_qid (unambiguous — no name matching)
// with missing birth_date / death_date / nationality from Wikidata SPARQL. Free API, no LLM.
// Only accepts day-precision dates (avoids the YYYY-01-01 year-only data-quality trap).
// Resumable via a keyset cursor file. Per-row writes via the Supabase Management API.
//
// Run: GEOCODE_TOKEN=sbp_... node scripts/backfill-personality-wikidata.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const TOKEN = process.env.GEOCODE_TOKEN;
const SPARQL = 'https://query.wikidata.org/sparql';
const UA = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide) personality-wikidata-backfill';
const CURSOR_FILE = 'scripts/output/pers-wikidata.cursor';
const BATCH = 50;
const SLEEP_MS = Number(process.env.SLEEP_MS || 1500);

if (!TOKEN) { console.error('GEOCODE_TOKEN not set'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sq = (s) => (s == null ? null : String(s).replace(/'/g, "''"));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function fetchT(url, opts = {}, timeoutMs = 30000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

async function mgmt(sql, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchT(MGMT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 QueerGuide/1.0' },
        body: JSON.stringify({ query: sql }),
      }, 30000);
      const body = await res.text();
      if (res.ok) return body ? JSON.parse(body) : [];
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(`mgmt ${res.status}: ${body.slice(0, 200)}`);
    } catch (e) { if (i === tries - 1) throw e; await sleep(2000 * (i + 1)); }
  }
}

async function sparql(qids, tries = 3) {
  const values = qids.map((q) => `wd:${q}`).join(' ');
  const query = `SELECT ?item ?type ?dob ?dobp ?dod ?dodp ?cit WHERE {
    VALUES ?item { ${values} }
    OPTIONAL { ?item wdt:P31 ?type }
    OPTIONAL { ?item p:P569/psv:P569 [ wikibase:timeValue ?dob; wikibase:timePrecision ?dobp ] }
    OPTIONAL { ?item p:P570/psv:P570 [ wikibase:timeValue ?dod; wikibase:timePrecision ?dodp ] }
    OPTIONAL { ?item wdt:P27 ?citItem. ?citItem rdfs:label ?cit FILTER(lang(?cit)="en") }
  }`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchT(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } }, 25000);
      if (res.status === 429 || res.status >= 500) { await sleep(5000 * (i + 1)); continue; }
      if (!res.ok) return null;
      const j = await res.json();
      const tmp = {};
      for (const b of j.results.bindings) {
        const qid = b.item.value.split('/').pop();
        const o = tmp[qid] || (tmp[qid] = { types: new Set() });
        if (b.type) o.types.add(b.type.value.split('/').pop());
        if (b.dob && b.dobp && Number(b.dobp.value) >= 11 && !o.dob) o.dob = b.dob.value.slice(0, 10);
        if (b.dod && b.dodp && Number(b.dodp.value) >= 11 && !o.dod) o.dod = b.dod.value.slice(0, 10);
        if (b.cit && !o.cit) o.cit = b.cit.value;
      }
      const out = {};
      for (const [qid, o] of Object.entries(tmp)) {
        if (!o.types.has('Q5')) { out[qid] = { nonHuman: true }; continue; } // P31=Q5 human gate
        out[qid] = { dob: o.dob, dod: o.dod, cit: o.cit };
      }
      return out;
    } catch (e) { if (i === tries - 1) return null; await sleep(4000 * (i + 1)); }
  }
  return null;
}

function readCursor() { try { return existsSync(CURSOR_FILE) ? readFileSync(CURSOR_FILE, 'utf8').trim() : '00000000-0000-0000-0000-000000000000'; } catch { return '00000000-0000-0000-0000-000000000000'; } }
function writeCursor(id) { try { writeFileSync(CURSOR_FILE, id); } catch {} }

async function main() {
  let cursor = readCursor();
  console.log(`[${ts()}] personality wikidata-by-QID enrichment starting (cursor=${cursor})`);
  let processed = 0, dob = 0, dod = 0, nat = 0, badqid = 0;
  for (;;) {
    const rows = await mgmt(
      `SELECT id, wikidata_qid, birth_date, death_date, nationality, is_living FROM personalities
       WHERE duplicate_of_id IS NULL AND wikidata_qid IS NOT NULL AND id > '${cursor}'
         AND (birth_date IS NULL OR nationality IS NULL OR nationality='' OR (death_date IS NULL AND is_living=false))
       ORDER BY id LIMIT ${BATCH}`
    );
    if (!rows || rows.length === 0) break;
    const qids = [...new Set(rows.map((r) => r.wikidata_qid).filter((q) => /^Q\d+$/.test(q)))];
    const data = (qids.length ? await sparql(qids) : {}) || {};
    for (const r of rows) {
      processed++;
      try {
        const d = data[r.wikidata_qid];
        if (d && d.nonHuman) {
          badqid++;
          await mgmt(`UPDATE personalities SET needs_attention=true, updated_at=now() WHERE id='${r.id}'`);
        } else if (d) {
          const sets = [];
          if (!r.birth_date && d.dob) { sets.push(`birth_date='${d.dob}'`); dob++; }
          if (!r.death_date && d.dod) { sets.push(`death_date='${d.dod}', is_living=false`); dod++; }
          if ((!r.nationality || r.nationality === '') && d.cit) { sets.push(`nationality='${sq(d.cit)}'`); nat++; }
          if (sets.length) await mgmt(`UPDATE personalities SET ${sets.join(', ')}, updated_at=now() WHERE id='${r.id}'`);
        }
      } catch (e) { console.error(`[${ts()}] row ${r.id} error (skipping): ${e.message}`); }
      cursor = r.id;
    }
    writeCursor(cursor);
    console.log(`[${ts()}] processed=${processed} +dob=${dob} +death=${dod} +nat=${nat} badqid=${badqid} cursor=${cursor}`);
    await sleep(SLEEP_MS);
  }
  console.log(`[${ts()}] DONE. processed=${processed} dob=${dob} death=${dod} nat=${nat} badqid=${badqid}`);
}

main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
