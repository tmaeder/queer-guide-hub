// Marketplace Tagging Truth Engine — shared normalizer (P1b).
// Pure + DB-backed generalization of the amenity-normalize pattern, for products.
//
// Given a product's {title, description, brand, subcategory, communityOwnedTags} it derives:
//   department   -> a canonical FINE subcategory whose slug feeds BOTH
//                   marketplace_content_rating() and marketplace_department() correctly.
//                   Re-derived per-product from title/desc keywords (replaces the
//                   source-level subcategory mapping that misbuckets items).
//   attributes   -> { material[], occasion[], vibe[] } — ONLY terms literally present in
//                   the text, mapped to a controlled vocab loaded from unified_tags.
//                   Default-reject everything else (keeps the 2,020-distinct-value mess
//                   that polluted venues from leaking in here).
//   relevance    -> a real per-item lgbti_relevance_score from ownership + queer markers,
//                   replacing the flat per-source defaults (0.60 / 0.80).
//
// Department keyword precedence mirrors marketplace_content_rating() so the two never
// disagree on adult signals — that SQL fn stays the single source of truth for ratings;
// here we only choose the department bucket.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export type AttributeKind = 'material' | 'occasion' | 'vibe'

export interface AttributeVocab {
  /** kind -> set of canonical slugs (from unified_tags where category = kind). */
  material: Set<string>
  occasion: Set<string>
  vibe: Set<string>
}

export interface NormalizeInput {
  title?: string | null
  description?: string | null
  brand?: string | null
  subcategory?: string | null
  communityOwnedTags?: string[] | null
}

export interface NormalizeResult {
  /** Canonical fine subcategory display string (write to marketplace_listings.subcategory). */
  department: string
  /** Slug of `department` (what subcategory_slug + the rating/umbrella fns will derive). */
  departmentSlug: string
  /** Confidence the keyword classifier had; <0.5 means "keep existing, no evidence". */
  departmentConfidence: number
  attributes: { material: string[]; occasion: string[]; vibe: string[] }
  relevance: number
  /** Raw attribute terms seen but rejected (for audit/debug only). */
  dropped: string[]
}

// ── Canonical fine departments (display -> slug) ────────────────────────────
// Slugs chosen so marketplace_content_rating() department-base + marketplace_department()
// umbrella both classify them correctly. Keep these in sync with both SQL fns.
const DEPARTMENTS: Record<string, string> = {
  sex_toys: 'Sex Toys',
  anal_toys: 'Anal Toys',
  cock_rings_and_stretchers: 'Cock Rings and Stretchers',
  pumps_and_enlargement: 'Pumps and Enlargement',
  chastity: 'Chastity',
  bdsm_and_bondage: 'BDSM and Bondage',
  pup_and_pet_play: 'Pup and Pet Play',
  fetish_wear: 'Fetish Wear',
  underwear_and_swimwear: 'Underwear and Swimwear',
  swimwear: 'Swimwear',
  hygiene_and_care: 'Hygiene and Care',
  jewelry_and_pins: 'Jewelry and Pins',
  books_and_art: 'Books and Art',
  apparel_and_accessories: 'Apparel and Accessories',
}

export function slugifySubcat(s: string): string {
  return String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
}

// ── Tier 1: merchant-type classifier (evidence ladder, conf 0.95) ───────────
// Classifies the merchant's OWN short type label (marketplace_listing_sources.raw->
// product_type / category) into the canonical fine vocab. 53% of the catalog
// (ohmyfantasy) labels products in German ("Vibratoren", "Gleitgel", "Analplugs"),
// so stems are German+English. The label is short and unambiguous — far higher
// precision than free-text — which is why this tier auto-applies at 0.95.
// Precedence: anal/nipple/bdsm before jewelry/apparel ("Analkugelkette" vs "Kette",
// "Halsband" collar vs "Halskette" necklace, "Straps-Kleid" lingerie vs "Kleid").
const MERCHANT_TYPE_RULES: Array<{ slug: string; rx: RegExp }> = [
  { slug: 'anal_toys', rx: /(anal|prostata|p-?punkt)/i },
  { slug: 'chastity', rx: /(keuschheit|peniskäfig|käfig|chastity|cock ?cage)/i },
  { slug: 'cock_rings_and_stretchers', rx: /(penisring|hodenring|penisschlaufe|penismanschette|eichelschlaufe|penisriemen|cock ?ring|ball ?stretch)/i },
  { slug: 'pumps_and_enlargement', rx: /(penispumpe|vaginapumpe|nippelpumpe|vakuum|extender|vergrößerung|verlängerung|penis ?pump|enlarg|\bpumpe\b)/i },
  { slug: 'bdsm_and_bondage', rx: /(handschellen|fessel|peitsche|gerte|knebel|bondage|bdsm|flogger|padd(le|el)|spreiz|pranger|halsband|halsfessel|leine|klemme|klammer|nippel|zaumzeug|hog.?tie|rohrstock|nervenrad|nadelrad|bondageband|manschette|reizstrom|elektrostim|e-?stim|elektroden|restraint|handcuff|\bgag\b|whip|collar)/i },
  { slug: 'fetish_wear', rx: /(catsuit|wetlook|lack|latex|gummi|chaps|geschirr|harness|kopfmaske|augenmaske|maske|windel|fetish|pup ?hood|gimp)/i },
  { slug: 'sex_toys', rx: /(vibrator|vibro|vibrations?-?ei|dildo|masturbator|fleshlight|strap.?on|umschnall|penishülle|sleeve|liebespuppe|puppe|torso|vagina|liebeskugel|bullet|sexmaschine|liebesmaschine|liebesschaukel|stimulator|sauger|pulsator|massagestab|federstab|heizstab|dilator|spekulum|g-?punkt|klitoris|sexmöbel|sexhocker|liebeskissen|sex ?toy|spielzeug|toy)/i },
  { slug: 'hygiene_and_care', rx: /(gleitgel|gleitmittel|gleitcreme|kondom|massage|\böl\b|creme|lotion|spray|\bgel\b|seife|duschgel|shampoo|reinig|enthaarung|wachs|parf(u|ü)m|pheromon|tampon|periodentasse|intimdusche|intimgel|verzögerung|stimulations|orgasmus|aphrodisiakum|kapsel|nahrungsergänzung|stimulanzien|lutscher|zucker|süßigkeit|kaugummi|essbare|desinfektion|pflege|kosmetik|lipgloss|bräunung|kühlgel|mundspray|räucherstäbchen|raumspray|lufterfrischer|kerze|lube|lubricant|condom)/i },
  { slug: 'swimwear', rx: /(bademode|bikini|badeanzug|swim)/i },
  { slug: 'underwear_and_swimwear', rx: /(slip|string|tanga|thong|panty|pants|jock|boxer|unterwäsche|unterhose|\bbh\b|dessous|babydoll|neglig(é|e)|bodystocking|\bbody\b|straps|strumpf|strümpfe|cors(age|et)|korsett|korsage|bustier|mieder|teddy|chemise|peignoir|unterrock|ouvert|\brio\b|hotpants|underwear|briefs|lingerie)/i },
  { slug: 'jewelry_and_pins', rx: /(kette|schmuck|armband|anklet|necklace|bracelet|jewel|pendant|\bpins?\b(?!-)|brooch)/i },
  { slug: 'books_and_art', rx: /(buch|\bdvd\b|kalender|spiel|würfel|karten|book|calendar|poster|\bprint\b|\bzine\b|game)/i },
  { slug: 'apparel_and_accessories', rx: /(kleid|rock|\btop\b|shirt|hose|leggings|shorts|overall|kimono|mantel|tunika|schürze|handschuh|socken|\bhut\b|kostüm|perücke|stulpen|hemd|gürtel|tasche|schuh|apparel|hoodie|jacket|dress|skirt)/i },
]

/** Tier 1: classify the merchant's own type label. Null when no rule fires —
 *  fall through to Tier 2 text classification. */
export function classifyMerchantType(raw: string | null | undefined): { slug: string; display: string; confidence: number } | null {
  const s = String(raw ?? '').trim()
  if (!s || s.length > 120) return null
  for (const r of MERCHANT_TYPE_RULES) {
    if (r.rx.test(s)) return { slug: r.slug, display: DEPARTMENTS[r.slug], confidence: 0.95 }
  }
  return null
}

// Department classification rules, in precedence order (first hit wins). Adult-specific
// first, then SFW. Regexes are word-ish; ordering resolves "cock ring" vs "jewelry ring".
const DEPARTMENT_RULES: Array<{ slug: string; rx: RegExp; conf: number }> = [
  { slug: 'anal_toys', rx: /\b(butt ?plug|anal (plug|bead|hook|toy|trainer|kit)|prostate|p-?spot|analplug|analkette|analkugel|analvibrator|analdusche|prostata)\b/i, conf: 0.92 },
  { slug: 'cock_rings_and_stretchers', rx: /\b(cock ?ring|c-?ring|ball ?stretch|ball ?weight|scrotum|glans ?ring|penisring|hodenring)\b/i, conf: 0.92 },
  { slug: 'chastity', rx: /\b(chastity|cock ?cage|chastity ?cage|keyholder|keuschheit|peniskäfig)\b/i, conf: 0.92 },
  { slug: 'pumps_and_enlargement', rx: /\b(penis ?pump|cock ?pump|enlarg|girth|vacuum ?pump|penispumpe|penisvergrößerung)\b/i, conf: 0.9 },
  { slug: 'pup_and_pet_play', rx: /\b(pup ?hood|puppy ?(hood|play|mask)|pet ?play|neoprene ?hood)\b/i, conf: 0.9 },
  { slug: 'bdsm_and_bondage', rx: /\b(bdsm|bondage|restraint|handcuff|wrist ?cuff|ankle ?cuff|flogger|paddle|spank|whip|gag|ball ?gag|collar and leash|leash|impact ?play|shibari|rope ?play|nipple ?clamp|e-?stim|handschellen|fessel(n|-?set)?|peitsche|knebel|nippelklemme|spreizstange)\b/i, conf: 0.88 },
  { slug: 'fetish_wear', rx: /\b(fetish|latex (suit|gear|hood|wear)|rubber (suit|gear)|gimp|leather harness|jock harness|chest harness|puppy gear|catsuit|wetlook)\b/i, conf: 0.85 },
  { slug: 'sex_toys', rx: /\b(dildo|vibrator|masturbat|fleshlight|stroker|onahole|strap[- ]?on|sex ?toy|g-?spot|wand massager|fisting|onanism|suction cup dildo|liebeskugel|massagestab|umschnall)\b/i, conf: 0.9 },
  { slug: 'hygiene_and_care', rx: /\b(lube|lubricant|condom|douche|enema|anal ?cleaner|toy ?cleaner|intimate ?wash|wipes|deodorant|shampoo|skincare|soap|moisturiz|grooming|gleitgel|gleitmittel|kondom|massageöl)\b/i, conf: 0.82 },
  { slug: 'swimwear', rx: /\b(swimwear|swimsuit|swim ?trunk|swim ?brief|board ?short|bikini|speedo)\b/i, conf: 0.85 },
  { slug: 'underwear_and_swimwear', rx: /\b(jockstrap|jock ?strap|\bthong\b|boxer ?brief|\bbriefs?\b|underwear|lingerie|bralette|harness brief|long ?john)\b/i, conf: 0.85 },
  { slug: 'jewelry_and_pins', rx: /\b(necklace|bracelet|earring|pendant|\bbrooch\b|\bbadge\b|enamel ?pin|lapel ?pin|\bring\b|\bchain\b|cufflink|anklet)\b/i, conf: 0.78 },
  { slug: 'books_and_art', rx: /\b(book|novel|memoir|zine|magazine|poster|art ?print|\bprint\b|painting|calendar|postcard|greeting ?card|comic|graphic ?novel)\b/i, conf: 0.78 },
  { slug: 'apparel_and_accessories', rx: /\b(t-?shirt|\btee\b|hoodie|sweatshirt|sweater|jumper|jacket|\bcoat\b|\bdress\b|\bskirt\b|\bpants\b|trousers|\bshorts\b|\bsocks\b|\bhat\b|\bcap\b|beanie|\bbag\b|\btote\b|backpack|keychain|lanyard|\bflag\b|\bmug\b|\bpatch\b|sticker|\bscarf\b|\bgloves\b|apparel|\bcloth)\b/i, conf: 0.7 },
]

/** Choose the canonical fine department for a product. Falls back to the existing
 *  subcategory (no evidence -> confidence 0.4) so we never blank a known bucket. */
export function classifyDepartment(input: NormalizeInput): { slug: string; display: string; confidence: number } {
  const txt = `${input.title ?? ''} ${input.description ?? ''}`.toLowerCase()
  for (const r of DEPARTMENT_RULES) {
    if (r.rx.test(txt)) return { slug: r.slug, display: DEPARTMENTS[r.slug], confidence: r.conf }
  }
  // No keyword evidence — keep the current subcategory unchanged.
  const existing = slugifySubcat(input.subcategory ?? '')
  if (existing && DEPARTMENTS[existing]) return { slug: existing, display: DEPARTMENTS[existing], confidence: 0.4 }
  if (existing) return { slug: existing, display: String(input.subcategory).trim(), confidence: 0.4 }
  return { slug: 'apparel_and_accessories', display: DEPARTMENTS['apparel_and_accessories'], confidence: 0.3 }
}

// ── Attribute aliases (raw phrase -> canonical slug). Phrase match, longest-first. ──
const MATERIAL_ALIASES: Record<string, string> = {
  'organic cotton': 'cotton', 'cotton': 'cotton',
  'faux leather': 'vegan-leather', 'vegan leather': 'vegan-leather', 'pu leather': 'vegan-leather',
  'genuine leather': 'leather', 'real leather': 'leather', 'leather': 'leather',
  'silicone': 'silicone', 'medical grade silicone': 'silicone', 'body-safe silicone': 'silicone',
  'latex': 'latex', 'rubber': 'rubber',
  'mesh': 'mesh', 'lace': 'lace', 'satin': 'satin', 'denim': 'denim', 'wool': 'wool',
  'merino wool': 'wool', 'nylon': 'nylon', 'spandex': 'spandex', 'elastane': 'spandex',
  'bamboo': 'bamboo', 'modal': 'modal',
  'stainless steel': 'stainless-steel', 'surgical steel': 'stainless-steel',
  'sterling silver': 'silver', '925 silver': 'silver', 'silver': 'silver',
  '14k gold': 'gold', '18k gold': 'gold', 'gold plated': 'gold', 'gold': 'gold',
  'glass': 'glass', 'borosilicate': 'glass', 'wood': 'wood', 'wooden': 'wood',
  'ceramic': 'ceramic', 'metal': 'metal',
  // German (53% of catalog)
  'leder': 'leather', 'kunstleder': 'vegan-leather', 'silikon': 'silicone',
  'baumwolle': 'cotton', 'spitze': 'lace', 'edelstahl': 'stainless-steel',
  'silber': 'silver', 'glas': 'glass', 'holz': 'wood', 'metall': 'metal',
  'netz': 'mesh', 'wolle': 'wool', 'keramik': 'ceramic', 'bambus': 'bamboo',
  'jeans': 'denim',
}
const OCCASION_ALIASES: Record<string, string> = {
  'pride': 'pride', 'pride month': 'pride', 'rainbow': 'pride', 'progress pride': 'pride', 'csd': 'pride',
  'drag': 'drag', 'drag queen': 'drag', 'drag king': 'drag', 'drag show': 'drag',
  'wedding': 'wedding', 'bridal': 'wedding', 'engagement': 'wedding', 'anniversary': 'wedding',
  'everyday': 'everyday', 'daily wear': 'everyday', 'casual': 'everyday',
  'festival': 'festival', 'rave': 'festival', 'party': 'party', 'clubwear': 'party', 'nightlife': 'party',
  'halloween': 'halloween', 'costume': 'halloween', 'cosplay': 'halloween',
  'gym': 'gym', 'workout': 'gym', 'activewear': 'gym', 'sport': 'gym',
  'beach': 'beach', 'poolside': 'beach', 'holiday': 'holiday', 'vacation': 'holiday',
  // German
  'hochzeit': 'wedding', 'alltag': 'everyday', 'strand': 'beach',
  'weihnachten': 'holiday', 'urlaub': 'holiday', 'fitness': 'gym',
}
const VIBE_ALIASES: Record<string, string> = {
  'minimal': 'minimal', 'minimalist': 'minimal', 'understated': 'minimal',
  'bold': 'bold', 'statement': 'bold', 'loud': 'bold',
  'vintage': 'vintage', 'retro': 'vintage', 'classic': 'vintage',
  'sporty': 'sporty', 'athletic': 'sporty',
  'cute': 'cute', 'kawaii': 'cute', 'elegant': 'elegant', 'luxury': 'elegant', 'premium': 'elegant',
  'gothic': 'gothic', 'goth': 'gothic', 'dark': 'gothic',
  'colorful': 'colorful', 'colourful': 'colorful', 'vibrant': 'colorful',
  'handmade': 'handmade', 'hand-made': 'handmade', 'handcrafted': 'handmade', 'artisan': 'handmade',
  // German
  'handgemacht': 'handmade', 'handgefertigt': 'handmade', 'sportlich': 'sporty',
  'bunt': 'colorful', 'schlicht': 'minimal', 'niedlich': 'cute',
}

const QUEER_MARKER_RX = /\b(lgbtq?|queer|\bgay\b|lesbian|sapphic|\btrans\b|transgender|nonbinary|non-binary|enby|bisexual|pride|rainbow|\bdrag\b|two-?spirit|genderqueer|pansexual|asexual)\b/i

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Find controlled-vocab attribute slugs literally present in `txt`. Default-reject.
 *  Longest phrases match first and consume their span, so "faux leather" -> vegan-leather
 *  does NOT also fire the substring "leather" -> leather. */
function extractAttribute(
  txt: string,
  aliases: Record<string, string>,
  vocab: Set<string>,
): string[] {
  const found = new Set<string>()
  let work = txt
  const phrases = Object.keys(aliases).sort((a, b) => b.length - a.length)
  for (const phrase of phrases) {
    const slug = aliases[phrase]
    if (!vocab.has(slug)) continue // vocab is authoritative — alias may point at a non-seeded slug
    const rx = new RegExp(`(^|[^a-z])(${escapeRx(phrase)})([^a-z]|$)`, 'ig')
    if (rx.test(work)) {
      found.add(slug)
      // Blank out matched occurrences so shorter overlapping phrases can't re-match.
      work = work.replace(new RegExp(`(^|[^a-z])(${escapeRx(phrase)})([^a-z]|$)`, 'ig'), '$1 $3')
    }
  }
  return [...found].sort()
}

/** Per-item relevance from real signals (replaces flat per-source defaults). */
export function scoreRelevance(input: NormalizeInput): number {
  const txt = `${input.title ?? ''} ${input.description ?? ''} ${input.brand ?? ''}`
  let s = 0.6
  if ((input.communityOwnedTags ?? []).length) s += 0.2
  if (QUEER_MARKER_RX.test(txt)) s += 0.2
  return Math.max(0, Math.min(1, Math.round(s * 100) / 100))
}

/** Full per-product re-classification. Pure given a loaded vocab. */
export function normalizeMarketplaceProduct(input: NormalizeInput, vocab: AttributeVocab): NormalizeResult {
  const txt = `${input.title ?? ''} ${input.description ?? ''}`.toLowerCase()
  const dept = classifyDepartment(input)
  return {
    department: dept.display,
    departmentSlug: dept.slug,
    departmentConfidence: dept.confidence,
    attributes: {
      material: extractAttribute(txt, MATERIAL_ALIASES, vocab.material),
      occasion: extractAttribute(txt, OCCASION_ALIASES, vocab.occasion),
      vibe: extractAttribute(txt, VIBE_ALIASES, vocab.vibe),
    },
    relevance: scoreRelevance(input),
    dropped: [],
  }
}

// Attribute tag slugs are namespaced in unified_tags to avoid colliding with the many
// existing global tags (drag, leather, pride, festival…). The normalizer works in BARE
// slugs (cotton, pride, minimal); storage adds/strips the per-kind prefix.
export const ATTRIBUTE_PREFIX: Record<AttributeKind, string> = {
  material: 'mat-',
  occasion: 'occ-',
  vibe: 'vibe-',
}

/** Full namespaced unified_tags slug for a bare attribute slug. */
export function attributeSlug(kind: AttributeKind, bare: string): string {
  return `${ATTRIBUTE_PREFIX[kind]}${bare}`
}

function stripPrefix(kind: AttributeKind, slug: string): string {
  const p = ATTRIBUTE_PREFIX[kind]
  return slug.startsWith(p) ? slug.slice(p.length) : slug
}

/** Build a vocab object from raw unified_tags rows (bare or namespaced slug — testable). */
export function buildAttributeVocab(rows: Array<{ slug: string; category: string }>): AttributeVocab {
  const v: AttributeVocab = { material: new Set(), occasion: new Set(), vibe: new Set() }
  for (const r of rows) {
    if (!r?.slug) continue
    if (r.category === 'material') v.material.add(stripPrefix('material', r.slug))
    else if (r.category === 'occasion') v.occasion.add(stripPrefix('occasion', r.slug))
    else if (r.category === 'vibe') v.vibe.add(stripPrefix('vibe', r.slug))
  }
  return v
}

let _cache: AttributeVocab | null = null

/** Load + cache the marketplace attribute vocabulary from unified_tags. */
export async function loadAttributeVocabulary(supabase: SupabaseClient, force = false): Promise<AttributeVocab> {
  if (_cache && !force) return _cache
  const { data, error } = await supabase
    .from('unified_tags')
    .select('slug, category')
    .in('category', ['material', 'occasion', 'vibe'])
    .eq('status', 'active')
  if (error) throw new Error(`loadAttributeVocabulary: ${error.message}`)
  _cache = buildAttributeVocab((data ?? []) as Array<{ slug: string; category: string }>)
  return _cache
}

/** Tier rank mirroring marketplace_content_rating() — for the edge fn's downgrade gate. */
export function contentTierRank(subcategorySlug: string, title?: string | null, description?: string | null): number {
  const slug = slugifySubcat(subcategorySlug)
  const txt = `${title ?? ''} ${description ?? ''}`.toLowerCase()
  const base =
    ['sex_toys', 'anal_toys', 'cock_rings_and_stretchers', 'pumps_and_enlargement', 'chastity', 'bdsm_and_bondage', 'pup_and_pet_play'].includes(slug) ? 4 :
    ['fetish_wear', 'fetish_gear'].includes(slug) ? 3 :
    ['underwear_and_swimwear', 'underwear', 'swimwear'].includes(slug) ? 2 : 1
  const kw =
    /(dildo|butt ?plug|vibrator|cock ?ring|ball ?stretch|chastity|bondage|\bbdsm\b|fisting|prostate|masturbat|fleshlight|strap[- ]?on|anal (plug|bead|douche|hook)|nipple clamp|urethral|e-?stim|stroker)/.test(txt) ? 4 :
    /(fetish|leather harness|pup hood|puppy hood|\blube\b|lubricant|enema|latex (gear|suit)|rubber (gear|suit)|erotic|\bkink\b)/.test(txt) ? 3 :
    /(jockstrap|jock strap|\bthong\b|lingerie|harness|\bsexy\b)/.test(txt) ? 2 : 1
  return Math.max(base, kw)
}
