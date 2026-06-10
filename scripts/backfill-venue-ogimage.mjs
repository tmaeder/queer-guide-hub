#!/usr/bin/env node
// Source a real venue image by fetching the venue's own website and extracting og:image /
// twitter:image (legit photos, NOT generated). Writes the absolute URL into venues.images[].
// Only touches imageless venues that have an http(s) website. Resumable via cursor (keyset by id).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const TOKEN = process.env.GEOCODE_TOKEN;
const CURSOR = 'scripts/output/venue-ogimage.cursor';
const BATCH = 40, CONC = 10;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
if (!TOKEN) { console.error('GEOCODE_TOKEN not set'); process.exit(1); }

async function fetchT(url, opts = {}, timeoutMs = 9000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal, redirect: 'follow' }); } finally { clearTimeout(t); }
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
const sq = (s) => String(s).replace(/'/g, "''");

function extractImage(html, baseUrl) {
  const pick = (re) => { const m = html.match(re); return m ? m[1] : null; };
  let img =
    pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    pick(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
  if (!img) return null;
  img = img.trim().replace(/&amp;/g, '&');
  try {
    if (img.startsWith('//')) img = 'https:' + img;
    else if (img.startsWith('/')) { const u = new URL(baseUrl); img = u.origin + img; }
    else if (!/^https?:\/\//i.test(img)) img = new URL(img, baseUrl).href;
    const u = new URL(img);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.protocol = 'https:'; // force https to avoid mixed-content blocks
    const low = u.pathname.toLowerCase();
    if (/favicon|sprite|placeholder|logo-?default|blank/.test(u.href.toLowerCase())) return null;
    if (low.endsWith('.svg') || low.endsWith('.ico')) return null;
    return u.href.slice(0, 1000);
  } catch { return null; }
}

async function ogimage(website) {
  try {
    const res = await fetchT(website, { headers: { 'User-Agent': UA, Accept: 'text/html' } }, 9000);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) return null;
    const html = (await res.text()).slice(0, 200000);
    return extractImage(html, res.url || website);
  } catch { return null; }
}
const readCur = () => { try { return existsSync(CURSOR) ? readFileSync(CURSOR, 'utf8').trim() : '00000000-0000-0000-0000-000000000000'; } catch { return '00000000-0000-0000-0000-000000000000'; } };

async function main() {
  let cursor = readCur();
  console.log(`[${ts()}] venue og:image sourcing starting (cursor=${cursor})`);
  let seen = 0, found = 0;
  for (;;) {
    const rows = await mgmt(`SELECT id, website FROM venues WHERE duplicate_of_id IS NULL AND (images IS NULL OR array_length(images,1) IS NULL) AND website ~* '^https?://' AND id > '${cursor}' ORDER BY id LIMIT ${BATCH}`);
    if (!rows?.length) break;
    for (let i = 0; i < rows.length; i += CONC) {
      const chunk = rows.slice(i, i + CONC);
      const imgs = await Promise.all(chunk.map((r) => ogimage(r.website)));
      await Promise.all(chunk.map(async (r, k) => {
        seen++;
        if (imgs[k]) { await mgmt(`UPDATE venues SET images=ARRAY['${sq(imgs[k])}'], updated_at=now() WHERE id='${r.id}'`); found++; }
      }));
      cursor = chunk[chunk.length - 1].id;
      writeFileSync(CURSOR, cursor);
    }
    console.log(`[${ts()}] seen=${seen} found=${found} (${Math.round(100 * found / seen)}%) cursor=${cursor}`);
    await sleep(300);
  }
  console.log(`[${ts()}] DONE. seen=${seen} found=${found}`);
}
main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
