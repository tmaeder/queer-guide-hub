#!/usr/bin/env node
// Marketplace — import Darklands (darklands.be/vendor-market) Shopify vendors.
//
// Darklands (Brussels fetish/leather) curates a vendor market. darklands.be itself
// is WordPress (no products.json); its vendor page links out to ~46 vendor sites.
// 15 of those are Shopify; this imports the 13 quality ones (excludes toro-leather
// = empty template, and mr-riegillio = already in the catalog via the misterb source).
// These are fetish/leather/rubber — they DEEPEN the adult category with clean
// first-party data (better than the rotted misterb/forttroff scrapes), not diversify.
//
// CURRENCY GOTCHA: Shopify Markets serves the *viewer's* presentment currency (CHF
// from a Swiss IP), masking the store base. products.json `price` is always in the
// store's BASE currency. Base was determined per store via the homepage
// `Shopify.currency={"active":X,"rate":1.0}` signal (rate==1 → active is base) and
// cross-checked against conversion rates. fx_rates (price_usd trigger) covers EUR/GBP/USD.
//
// Same pipeline as the Shopify import: filter junk → INSERT → triggers (slug, price_usd,
// image_assets→R2, search) → categorize via marketplace-categorize. Idempotent on
// (source_type, source_entity_id). Images are on cdn.shopify.com (render directly).

import { writeFileSync } from 'fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

const MERCHANTS = [
  { domain: 'nothosaur.com',            source: 'nothosaur',       brand: 'Nothosaur',         cur: 'USD' },
  { domain: 'www.wegan.eu',             source: 'wegan',           brand: 'WeGan',             cur: 'EUR' },
  { domain: 'www.spitfireleather.com',  source: 'spitfireleather', brand: 'Spitfire Leather',  cur: 'GBP' },
  { domain: 'cuffed.store',             source: 'cuffed',          brand: 'Cuffed',            cur: 'EUR' },
  { domain: 'strappmetal.com',          source: 'strappmetal',     brand: 'Strapp Metal',      cur: 'GBP' },
  { domain: 'provocateur.shop',         source: 'provocateur',     brand: 'Provocateur',       cur: 'EUR' },
  { domain: 'lorandlajos.com',          source: 'lorandlajos',     brand: 'Lor & Lajos',       cur: 'EUR' },
  { domain: 'www.creamteamberlin.com',  source: 'creamteamberlin', brand: 'Cream Team Berlin', cur: 'EUR' },
  { domain: 'rubbertwunk.com',          source: 'rubbertwunk',     brand: 'RubberTwunk',       cur: 'EUR' },
  { domain: 'abuniverse.com',           source: 'abuniverse',      brand: 'ABUniverse',        cur: 'EUR' },
  { domain: 'www.vilaingarcon.com',     source: 'vilaingarcon',    brand: 'Vilain Garçon',     cur: 'USD' },
  { domain: 'www.untitledrubber.com',   source: 'untitledrubber',  brand: 'Untitled Rubber',   cur: 'EUR' },
  { domain: 'kinkstar.store',           source: 'kinkstar',        brand: 'Kinkstar',          cur: 'EUR' },
];

const strip = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const JUNK = /gift card|gift-card|swatch|\bsample\b|deposit|example of past work|e-gift|store credit|example product/i;
const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => 'ARRAY[' + a.map(esc).join(',') + ']::text[]';
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };

const rows = [];
for (const m of MERCHANTS) {
  let kept = 0;
  for (let p = 1; p <= 8; p++) {
    let j;
    try { j = await (await fetch(`https://${m.domain}/products.json?limit=250&page=${p}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })).json(); } catch { break; }
    const ps = j.products || [];
    if (!ps.length) break;
    for (const pr of ps) {
      const v = pr.variants?.[0];
      const price = v ? parseFloat(v.price) : NaN;
      const body = strip(pr.body_html);
      const imgs = (pr.images || []).map((i) => i.src).filter(Boolean).slice(0, 6);
      if (JUNK.test(pr.title) || JUNK.test(body) || pr.product_type === 'Custom' || !(price > 0) || !imgs.length) continue;
      rows.push({ st: m.source, eid: String(pr.id), title: pr.title.slice(0, 300), desc: body.slice(0, 2000), price, cur: m.cur, images: imgs, url: `https://${m.domain}/products/${pr.handle}`, brand: m.brand });
      kept++;
    }
    if (ps.length < 250) break;
  }
  console.error(`${m.source}: ${kept}`);
}

const CHUNK = 100;
for (let i = 0; i < rows.length; i += CHUNK) {
  const vals = rows.slice(i, i + CHUNK).map((r) =>
    `(${esc(r.st)},${esc(r.eid)},${esc(r.title)},${esc(r.desc)},${r.price},${esc(r.cur)},${arr(r.images)},${esc(r.url)},${esc(r.brand)},${esc(r.brand)},${esc(host(r.url))},'products','active','auto',0.8,now())`,
  ).join(',\n');
  writeFileSync(`/tmp/dl_ins_${String(i).padStart(4, '0')}.sql`,
    `INSERT INTO marketplace_listings
(source_type,source_entity_id,title,description,price,currency,images,external_url,brand,business_name,merchant_domain,category,status,review_status,lgbti_relevance_score,classified_at)
VALUES\n${vals}\nON CONFLICT (source_type,source_entity_id) WHERE source_entity_id IS NOT NULL DO NOTHING;`);
}
console.error(`TOTAL ${rows.length} listings`);
