#!/usr/bin/env node
// Marketplace Phase 4 — import diverse queer-owned Shopify merchants via /products.json.
//
// Breaks the adult-product monoculture by adding apparel / jewelry / art from
// queer-owned brands. Each Shopify store exposes /products.json (full description,
// images, price); we map → filter junk → emit batched INSERTs for marketplace_listings.
// Listings go in with status='active', review_status='auto', and a source-trusted
// lgbti_relevance_score (these are curated queer brands — do NOT per-item relevance-gate
// them, or generic-but-legit items like a plain gold ring get killed; see Phase 2 lesson).
//
// Triggers do the rest: slug, price_usd (fx_rates), image_assets (→ R2 mirror via the
// image-ingest worker), search_documents. Categorize with the marketplace-categorize
// edge fn afterward (new rows have subcategory=NULL → it picks them up).
//
// Usage:
//   node scripts/marketplace-shopify-import.mjs            # writes /tmp/mp_ins_*.sql
//   then apply each .sql via the Management API query endpoint (or supabase db).
//
// Re-running is idempotent: ON CONFLICT (source_type, source_entity_id) DO NOTHING.

import { writeFileSync } from 'fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

// Verified queer-owned Shopify stores (2026-06-07). Confirm ownership before re-running.
const MERCHANTS = [
  { domain: 'automicgold.com', source: 'automicgold', brand: 'Automic Gold' }, // gender-neutral fine jewelry
  { domain: 'tomboyx.com',     source: 'tomboyx',     brand: 'TomboyX' },       // queer apparel / underwear
  { domain: 'ashandchess.com', source: 'ashandchess', brand: 'Ash + Chess' },  // queer art / prints / pins
  { domain: 'wildfang.com',    source: 'wildfang',    brand: 'Wildfang' },      // androgynous apparel
  { domain: 'kirrinfinch.com', source: 'kirrinfinch', brand: 'Kirrin Finch' }, // queer tailored menswear
];

const stripHtml = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
// Drop non-product junk: gift cards, fabric swatches, samples, deposits, Automic Gold's
// "Custom" past-work examples ("not reflective of today's prices"), and $0 / imageless rows.
const JUNK = /gift card|gift-card|swatch|\bsample\b|deposit|example of past work|e-gift|store credit/i;
const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => 'ARRAY[' + a.map(esc).join(',') + ']::text[]';
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } };

async function fetchAll(m) {
  const out = [];
  for (let p = 1; p <= 12; p++) {
    let data;
    try {
      const r = await fetch(`https://${m.domain}/products.json?limit=250&page=${p}`, { headers: { 'User-Agent': UA } });
      data = await r.json();
    } catch { break; }
    const prods = data.products || [];
    if (!prods.length) break;
    for (const pr of prods) {
      const v = pr.variants?.[0];
      const price = v ? parseFloat(v.price) : NaN;
      const body = stripHtml(pr.body_html);
      const imgs = (pr.images || []).map((i) => i.src).filter(Boolean).slice(0, 6);
      if (JUNK.test(pr.title) || JUNK.test(body) || pr.product_type === 'Custom' || !(price > 0) || !imgs.length) continue;
      out.push({
        source_type: m.source,
        source_entity_id: String(pr.id),
        title: pr.title.slice(0, 300),
        description: body.slice(0, 2000),
        price,
        images: imgs,
        external_url: `https://${m.domain}/products/${pr.handle}`,
        brand: m.brand,
      });
    }
    if (prods.length < 250) break;
  }
  return out;
}

const rows = [];
for (const m of MERCHANTS) {
  const items = await fetchAll(m);
  console.error(`${m.source}: ${items.length}`);
  rows.push(...items);
}

const CHUNK = 100;
let n = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const vals = rows.slice(i, i + CHUNK).map((r) =>
    `(${esc(r.source_type)},${esc(r.source_entity_id)},${esc(r.title)},${esc(r.description)},${r.price},'USD',${arr(r.images)},${esc(r.external_url)},${esc(r.brand)},${esc(r.brand)},${esc(hostOf(r.external_url))},'products','active','auto',0.8,now())`,
  ).join(',\n');
  writeFileSync(
    `/tmp/mp_ins_${String(i).padStart(4, '0')}.sql`,
    `INSERT INTO marketplace_listings
(source_type,source_entity_id,title,description,price,currency,images,external_url,brand,business_name,merchant_domain,category,status,review_status,lgbti_relevance_score,classified_at)
VALUES\n${vals}\nON CONFLICT (source_type,source_entity_id) WHERE source_entity_id IS NOT NULL DO NOTHING;`,
  );
  n++;
}
console.error(`wrote ${n} INSERT files for ${rows.length} listings`);
