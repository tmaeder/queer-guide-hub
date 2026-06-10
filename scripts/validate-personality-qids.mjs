#!/usr/bin/env node
// Validate every personalities.wikidata_qid against Wikidata P31. Null the qid (and flag
// needs_attention) when the linked item is provably NON-human (has P31 types, none = Q5) —
// these point to given-name / disambiguation items, not the person. Leaves qids whose entity
// has no P31 (insufficient evidence) untouched. Resumable via cursor file.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const TOKEN = process.env.GEOCODE_TOKEN;
const SPARQL = 'https://query.wikidata.org/sparql';
const UA = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide) qid-validation';
const CURSOR = 'scripts/output/pers-qid-validate.cursor';
const BATCH = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
if (!TOKEN) { console.error('GEOCODE_TOKEN not set'); process.exit(1); }

async function fetchT(url, opts = {}, timeoutMs = 30000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); }
}
async function mgmt(sql, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchT(MGMT, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 QG' }, body: JSON.stringify({ query: sql }) }, 30000);
      const body = await res.text();
      if (res.ok) return body ? JSON.parse(body) : [];
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(`mgmt ${res.status}: ${body.slice(0, 150)}`);
    } catch (e) { if (i === tries - 1) throw e; await sleep(2000 * (i + 1)); }
  }
}
async function p31(qids, tries = 3) {
  const values = qids.map((q) => `wd:${q}`).join(' ');
  const query = `SELECT ?item ?type WHERE { VALUES ?item { ${values} } OPTIONAL { ?item wdt:P31 ?type } }`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchT(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } }, 25000);
      if (res.status === 429 || res.status >= 500) { await sleep(5000 * (i + 1)); continue; }
      if (!res.ok) return null;
      const j = await res.json();
      const types = {};
      for (const b of j.results.bindings) {
        const qid = b.item.value.split('/').pop();
        (types[qid] || (types[qid] = new Set())).add(b.type ? b.type.value.split('/').pop() : null);
      }
      return types;
    } catch (e) { if (i === tries - 1) return null; await sleep(4000 * (i + 1)); }
  }
  return null;
}
const sq = (s) => String(s).replace(/'/g, "''");
const readCur = () => { try { return existsSync(CURSOR) ? readFileSync(CURSOR, 'utf8').trim() : '00000000-0000-0000-0000-000000000000'; } catch { return '00000000-0000-0000-0000-000000000000'; } };

async function main() {
  let cursor = readCur();
  console.log(`[${ts()}] qid validation starting (cursor=${cursor})`);
  let checked = 0, nulled = 0, human = 0, noinfo = 0;
  for (;;) {
    const rows = await mgmt(`SELECT id, wikidata_qid FROM personalities WHERE duplicate_of_id IS NULL AND wikidata_qid ~ '^Q[0-9]+$' AND id > '${cursor}' ORDER BY id LIMIT ${BATCH}`);
    if (!rows?.length) break;
    const qids = [...new Set(rows.map((r) => r.wikidata_qid))];
    const types = (await p31(qids)) || {};
    for (const r of rows) {
      checked++;
      const ts_ = types[r.wikidata_qid];
      if (ts_ && ts_.size && !ts_.has(null) && !ts_.has('Q5')) {
        // has concrete P31 type(s), none human → wrong link
        await mgmt(`UPDATE personalities SET wikidata_qid=NULL, needs_attention=true, updated_at=now() WHERE id='${r.id}'`);
        nulled++;
      } else if (ts_ && ts_.has('Q5')) { human++; } else { noinfo++; }
      cursor = r.id;
    }
    writeFileSync(CURSOR, cursor);
    console.log(`[${ts()}] checked=${checked} nulled=${nulled} human=${human} noinfo=${noinfo} cursor=${cursor}`);
    await sleep(1500);
  }
  console.log(`[${ts()}] DONE. checked=${checked} nulled=${nulled} human=${human} noinfo=${noinfo}`);
}
main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
