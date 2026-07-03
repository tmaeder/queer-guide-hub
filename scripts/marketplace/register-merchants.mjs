#!/usr/bin/env node
// Detect + register marketplace vendors as recurring sources.
//
// For each vendor domain, probes the Shopify public feed (/products.json) then
// the WooCommerce Store API (/wp-json/wc/store/v1/products), classifies the
// provider, and best-effort reads the storefront currency (Shopify /cart.json,
// Woo price currency_code). Then upserts public.marketplace_merchants — the
// registry the recurring engine (edge fn marketplace-sync-merchants + hourly
// cron) drives. `slug` MUST equal the existing marketplace_listings source_type
// so the commit RPC's (source_type, source_entity_id) refresh path matches.
//
// Providers: shopify-public / woocommerce-public → is_enabled=true (public
// feed). Anything else → 'crawl', is_enabled=false (no public product API yet;
// tracked but skipped until a crawler exists).
//
// Auth: Supabase PAT (SUPABASE_PAT env, or macOS keychain "Supabase CLI").
//
// Usage:
//   node scripts/marketplace/register-merchants.mjs --detect-only   # probe + print JSON, no DB
//   node scripts/marketplace/register-merchants.mjs --dry-run       # print the upsert SQL, no DB
//   node scripts/marketplace/register-merchants.mjs                 # detect + upsert (needs PAT)
//   node scripts/marketplace/register-merchants.mjs --add slug=domain,slug2=domain2   # extra vendors

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const args = process.argv.slice(2)
const DETECT_ONLY = args.includes('--detect-only')
const DRY_RUN = args.includes('--dry-run')

// slug -> [domain, display_name]. slug == existing marketplace_listings source_type.
const VENDORS = {
  ohmyfantasy: ['ohmyfantasy.com', 'OH MY! FANTASY'], misterb: ['misterb.com', 'MisterB'],
  fetchshop: ['fetchshop.co.uk', 'Fetch Shop'], prowlerred: ['prowlerred.com', 'Prowler RED'],
  regulation: ['regulation.store', 'Regulation'], ryvkstudio: ['ryvkstudio.com', 'RYVKstudio'],
  'mr-riegillio': ['mr-riegillio.com', 'MR. Riegillio'], automicgold: ['automicgold.com', 'Automic Gold'],
  barcodeberlin: ['barcodeberlin.com', 'BARCODE Berlin'], invinciblerubber: ['www.invinciblerubber.com', 'Invincible Rubber'],
  tomboyx: ['tomboyx.com', 'TomboyX'], orttu: ['orttu.com', 'ORTTU'], rufskin: ['rufskin.com', 'RUFSKIN'],
  bigbudpress: ['bigbudpress.com', 'Big Bud Press'], nothosaur: ['nothosaur.com', 'Nothosaur'],
  ashandchess: ['ashandchess.com', 'Ash + Chess'], charliebymz: ['charliebymz.com', 'Charlie by Matthew Zink'],
  forttroff: ['forttroff.com', 'Fort Troff'], puppyplayexpert: ['puppyplayexpert.com', 'Puppy Play Expert'],
  supergayunderwear: ['supergayunderwear.com', 'Super Gay Underwear'], peaudeloup: ['peaudeloup.com', 'Peau de Loup'],
  'twink-x': ['twink-x.com', 'Twink-X'], wegan: ['wegan.eu', 'WeGan'], wetforher: ['wetforher.com', 'Wet For Her'],
  pridesocks: ['pridesocks.com', 'Pride Socks'], wildfang: ['wildfang.com', 'Wildfang'],
  backroomgear: ['backroomgear.store', 'BackRoomGear'], spitfireleather: ['spitfireleather.com', 'Spitfire Leather'],
  cuffed: ['cuffed.store', 'Cuffed'], strappmetal: ['strappmetal.com', 'Strapp Metal'],
  provocateur: ['provocateur.shop', 'Provocateur'], effenberger: ['effenberger-couture.com', 'Effenberger Couture'],
  autostraddle: ['shop.autostraddle.com', 'For Them (Autostraddle)'], lorandlajos: ['lorandlajos.com', 'Lor & Lajos'],
  spectrumoutfitters: ['spectrumoutfitters.co.uk', 'Spectrum Outfitters'], kirrinfinch: ['kirrinfinch.com', 'Kirrin Finch'],
  rubbertwunk: ['rubbertwunk.com', 'Rubber Twunk'], creamteamberlin: ['creamteamberlin.com', 'Cream Team Berlin'],
  abuniverse: ['abuniverse.com', 'ABUniverse'], vilaingarcon: ['vilaingarcon.com', 'Vilain Garçon'],
  untitledrubber: ['untitledrubber.com', 'Untitled Rubber'], adamssceptre: ['adamssceptre.com', "Adam's Sceptre"],
  gfwclothing: ['gfwclothing.com', 'GFW Clothing'], beefcakeswimwear: ['beefcakeswimwear.com', 'Beefcake Swimwear'],
  kinkstar: ['kinkstar.store', 'Kinkstar'], androgynousfox: ['androgynousfox.com', 'Androgynous Fox'],
  breedwell: ['breedwell.com', 'Breedwell'], cellblock13: ['cellblock13.net', 'CellBlock 13'],
  dapperboi: ['www.dapperboi.com', 'Dapper Boi'], demask: ['demask.com', 'DeMask'],
  flavnt: ['flavnt.com', 'FLAVNT Streetwear'], garconmodel: ['garconmodel.com', 'Garçon Model'],
  gc2b: ['gc2b.co', 'gc2b'], marekrichard: ['marekrichard.com', 'Marek+Richard'], nastypig: ['nastypig.com', 'Nasty Pig'],
  newyorktoycollective: ['newyorktoycollective.com', 'New York Toy Collective'],
  origamicustoms: ['origamicustoms.com', 'Origami Customs'], paxsies: ['paxsies.com', 'Paxsies'],
  rodeoh: ['rodeoh.com', 'RodeoH'], teamm8: ['teamm8.com', 'Teamm8'],
  'pvc-up': ['pvc-up.com', 'PVC-UP'], 'friend-of-dorothy': ['friend-of-dorothy.com', 'Friend of Dorothy'],
  latexforever: ['latexforever.com', 'Latex Forever'], kink3d: ['kink3d.com', 'KINK3D'],
  goodboyunderwear: ['goodboyunderwear.com', 'Good Boy Underwear'], rubaddiction: ['www.rubaddiction.com', 'Rubaddiction'],
  latexas: ['www.latexas.com', 'Latexas'], 'carrara-designs': ['www.carrara-designs.com', 'Carrara Designs'],
  steelwerksextreme: ['www.steelwerksextreme.com', 'Steelwerks Extreme'],
}

// --add slug=domain,slug2=domain2 (display defaults to slug)
const addArg = args[args.indexOf('--add') + 1]
if (args.includes('--add') && addArg && !addArg.startsWith('--')) {
  for (const pair of addArg.split(',')) {
    const [slug, domain] = pair.split('=')
    if (slug && domain) VENDORS[slug.trim()] = [domain.trim(), slug.trim()]
  }
}

const TIMEOUT = 15000
async function get(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, redirect: 'follow', signal: ctrl.signal })
    return { status: res.status, text: await res.text() }
  } catch (e) { return { status: 0, text: String(e?.name || e) } }
  finally { clearTimeout(t) }
}

async function detect(slug, domain) {
  const sp = await get(`https://${domain}/products.json?limit=1`)
  if (sp.status === 200) {
    try {
      const j = JSON.parse(sp.text)
      if (j && Array.isArray(j.products)) {
        let currency = null
        const cart = await get(`https://${domain}/cart.json`)
        if (cart.status === 200) { try { currency = JSON.parse(cart.text)?.currency || null } catch { /* ignore */ } }
        return { slug, domain, provider: 'shopify-public', currency }
      }
    } catch { /* not shopify json */ }
  }
  const wc = await get(`https://${domain}/wp-json/wc/store/v1/products?per_page=1`)
  if (wc.status === 200) {
    try {
      const arr = JSON.parse(wc.text)
      if (Array.isArray(arr)) return { slug, domain, provider: 'woocommerce-public', currency: arr[0]?.prices?.currency_code || null }
    } catch { /* not woo json */ }
  }
  return { slug, domain, provider: 'crawl', currency: null }
}

// bounded-concurrency detection
async function detectAll() {
  const entries = Object.entries(VENDORS)
  const out = []
  const queue = [...entries]
  const worker = async () => {
    while (queue.length) {
      const [slug, [domain, name]] = queue.shift()
      const r = await detect(slug, domain)
      r.display_name = name
      out.push(r)
      process.stderr.write(`${r.provider.padEnd(18)} ${slug.padEnd(22)} ${r.currency || '-'}\n`)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  out.sort((a, b) => a.slug.localeCompare(b.slug))
  return out
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'"
function buildSql(rows) {
  const values = rows.map(r => {
    const enabled = r.provider !== 'crawl'
    const cfg = r.currency ? `'{"currency":"${r.currency}"}'::jsonb` : `'{}'::jsonb`
    return `  (${q(r.provider)}, ${q(r.slug)}, ${q(r.display_name)}, ${q(r.domain)}, ${cfg}, ${enabled})`
  }).join(',\n')
  return `INSERT INTO public.marketplace_merchants (provider, slug, display_name, shop_domain, config, is_enabled) VALUES\n${values}\nON CONFLICT (provider, slug) DO UPDATE SET\n  display_name = EXCLUDED.display_name,\n  shop_domain  = EXCLUDED.shop_domain,\n  config       = marketplace_merchants.config || EXCLUDED.config,\n  is_enabled   = EXCLUDED.is_enabled,\n  updated_at   = now();`
}

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
async function runSql(query, attempt = 0) {
  const TOKEN = token()
  let res
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
  } catch (e) {
    if (attempt < 4) { await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); return runSql(query, attempt + 1) }
    throw e
  }
  if ([429, 502, 503, 504].includes(res.status) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); return runSql(query, attempt + 1)
  }
  if (!res.ok) throw new Error(`SQL ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

const rows = await detectAll()
const counts = rows.reduce((a, r) => ((a[r.provider] = (a[r.provider] || 0) + 1), a), {})
process.stderr.write(`\ncounts: ${JSON.stringify(counts)}\n`)

if (DETECT_ONLY) { console.log(JSON.stringify(rows, null, 2)); process.exit(0) }
const sql = buildSql(rows)
if (DRY_RUN) { console.log(sql); process.exit(0) }
await runSql(sql)
process.stderr.write(`upserted ${rows.length} merchants\n`)
