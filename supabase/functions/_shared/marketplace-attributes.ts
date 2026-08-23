// Variant + attribute extraction from marketplace_listing_sources.raw.
// Pure functions (testable, no I/O) consumed by marketplace-variant-backfill.
//
// Canonical shapes (see COMMENT ON marketplace_listings.attributes, migration
// 20260926100100): attribute arrays hold canonical BARE slugs; sizes mix the
// alpha ladder (s, m, 2xl, one-size) with verbatim-canonicalized numerics
// (eu-38, w32). Only the alpha ladder is mirrored to size-* unified_tags.
//
// Option-name → axis map calibrated against the live corpus (2026-08-23):
// Size 22,022 / Color 13,724 / size 1,775 / Größe 1,588 / SIZE 561 / COLOR 541 /
// Colour 434 / Farbe 428 / metal 342 / Material 179 / Colore 161 / Taglia 158.
// "Title" (17,896) is Shopify's single-variant placeholder — never an axis.

export type VariantAxis = 'size' | 'color' | 'material'

export interface ExtractedVariant {
  source_variant_id: string | null
  sku: string | null
  title: string | null
  option_size: string | null
  option_size_raw: string | null
  option_color: string | null
  option_color_raw: string | null
  option_material: string | null
  options: Record<string, string>
  price: number | null
  currency: string | null
  available: boolean | null
  inventory_quantity: number | null
  position: number | null
  image_url: string | null
}

export interface ExtractedAttributes {
  size?: string[]
  color?: string[]
  material?: string[]
  genre?: string[]
  fit?: string[]
  condition?: string
  dimensions?: string
  gtin?: string
}

export interface VariantExtractResult {
  variants: ExtractedVariant[]
  attributes: ExtractedAttributes
}

// ── Option-name → axis ───────────────────────────────────────────────────────
const SIZE_NAMES = new Set(['size', 'sizes', 'größe', 'grösse', 'groesse', 'taille', 'talla', 'taglia'])
const COLOR_NAMES = new Set(['color', 'colour', 'colors', 'colours', 'farbe', 'couleur', 'colore', 'colour-asimage'])
const MATERIAL_NAMES = new Set(['material', 'stoff', 'metal', 'fabric'])

export function mapOptionName(name: string | null | undefined): VariantAxis | null {
  const n = String(name ?? '').trim().toLowerCase()
  if (!n) return null
  if (SIZE_NAMES.has(n)) return 'size'
  if (COLOR_NAMES.has(n)) return 'color'
  if (MATERIAL_NAMES.has(n)) return 'material'
  return null
}

// ── Size canonicalisation ────────────────────────────────────────────────────
const ALPHA_SIZES: Record<string, string> = {
  xxs: 'xxs', xs: 'xs', s: 's', m: 'm', l: 'l', xl: 'xl',
  xxl: '2xl', xxxl: '3xl', xxxxl: '4xl', xxxxxl: '5xl',
  '2xl': '2xl', '3xl': '3xl', '4xl': '4xl', '5xl': '5xl',
  small: 's', medium: 'm', large: 'l',
  'x small': 'xs', 'xx small': 'xxs', 'x large': 'xl', 'xx large': '2xl', 'xxx large': '3xl',
  'extra small': 'xs', 'extra large': 'xl',
}
const ONE_SIZE_RX = /^(one ?size( fits (all|most))?|os|onesize|unisize|einheitsgr\S*|taglia unica|talla [uú]nica)$/

/** The alpha size ladder, in display order. Mirrored client-side as SIZE_ORDER. */
export const SIZE_LADDER = ['xxs', 'xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl', '5xl', 'one-size'] as const

/** Canonicalise ONE size token. Default-reject: unknown shapes return null. */
export function canonicalSize(raw: string | null | undefined): string | null {
  let n = String(raw ?? '').trim().toLowerCase()
  if (!n || n === 'default title') return null
  if (ONE_SIZE_RX.test(n)) return 'one-size'
  // "Größe M", "size m", "eu 38", "us m" prefixes
  n = n.replace(/^(größe|grösse|groesse|size|taille|talla|taglia)\s+/, '')
  const dashless = n.replace(/[-.\s]+/g, ' ').trim()
  const alpha = ALPHA_SIZES[dashless] ?? ALPHA_SIZES[dashless.replace(/\s+/g, '')]
  if (alpha) return alpha
  // Waist sizes: W32, 32", 32w
  const w = n.match(/^w\s?(2[4-9]|3[0-9]|4[0-8])$/) ?? n.match(/^(2[4-9]|3[0-9]|4[0-8])\s?(w|")$/)
  if (w) return `w${w[1]}`
  // EU garment sizes (bare even-ish numbers; DE shops carry these)
  const eu = n.match(/^(?:eu\s?)?(3[0-9]|4[0-9]|5[0-2])$/)
  if (eu) return `eu-${eu[1]}`
  return null
}

/** Canonicalise a size VALUE that may be combined ("S/M", "L - XL"). */
export function canonicalSizes(raw: string | null | undefined): string[] {
  const s = String(raw ?? '').trim()
  if (!s) return []
  const whole = canonicalSize(s)
  if (whole) return [whole]
  const parts = s.split(/[/,]| - /).map((p) => canonicalSize(p)).filter((p): p is string => p !== null)
  return [...new Set(parts)]
}

// ── Colour canonicalisation ──────────────────────────────────────────────────
// Canonical set = the color-* vocabulary (migration 20260926100300).
const COLOR_ALIASES: Record<string, string> = {
  black: 'black', schwarz: 'black', noir: 'black', nero: 'black', 'jet black': 'black', midnight: 'black', onyx: 'black',
  white: 'white', weiß: 'white', weiss: 'white', blanc: 'white', bianco: 'white', ivory: 'white', 'off white': 'white',
  grey: 'grey', gray: 'grey', grau: 'grey', charcoal: 'grey', anthracite: 'grey', anthrazit: 'grey', slate: 'grey', 'heather grey': 'grey', 'heather gray': 'grey',
  red: 'red', rot: 'red', rouge: 'red', rosso: 'red', burgundy: 'red', maroon: 'red', wine: 'red', crimson: 'red', scarlet: 'red', cherry: 'red',
  orange: 'orange', coral: 'orange', rust: 'orange', peach: 'orange',
  yellow: 'yellow', gelb: 'yellow', mustard: 'yellow', lemon: 'yellow',
  green: 'green', grün: 'green', gruen: 'green', olive: 'green', khaki: 'green', mint: 'green', sage: 'green', forest: 'green', emerald: 'green', lime: 'green',
  blue: 'blue', blau: 'blue', bleu: 'blue', blu: 'blue', royal: 'blue', 'royal blue': 'blue', 'sky blue': 'blue', teal: 'blue', turquoise: 'blue', türkis: 'blue', aqua: 'blue', cyan: 'blue', petrol: 'blue', 'light blue': 'blue', denim: 'blue', cobalt: 'blue',
  navy: 'navy', 'navy blue': 'navy', marine: 'navy', marineblau: 'navy', 'dark blue': 'navy', dunkelblau: 'navy',
  purple: 'purple', lila: 'purple', violet: 'purple', violett: 'purple', lavender: 'purple', lilac: 'purple', plum: 'purple', aubergine: 'purple',
  pink: 'pink', rosa: 'pink', rose: 'pink', magenta: 'pink', fuchsia: 'pink', 'hot pink': 'pink', blush: 'pink', salmon: 'pink',
  brown: 'brown', braun: 'brown', chocolate: 'brown', tan: 'brown', camel: 'brown', mocha: 'brown', coffee: 'brown',
  beige: 'beige', sand: 'beige', nude: 'beige', taupe: 'beige', khakibeige: 'beige',
  cream: 'cream', creme: 'cream', ecru: 'cream', natural: 'cream',
  gold: 'gold', golden: 'gold', 'yellow gold': 'gold',
  silver: 'silver', silber: 'silver', 'sterling silver': 'silver',
  'rose gold': 'rose-gold', rosegold: 'rose-gold', roségold: 'rose-gold',
  clear: 'clear', transparent: 'clear', translucent: 'clear',
  multicolor: 'multicolor', multicolour: 'multicolor', multi: 'multicolor', bunt: 'multicolor', mehrfarbig: 'multicolor', 'multi color': 'multicolor',
  rainbow: 'rainbow', regenbogen: 'rainbow', pride: 'rainbow',
}

/** Canonicalise ONE colour token. Default-reject. */
export function canonicalColor(raw: string | null | undefined): string | null {
  const n = String(raw ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (!n || n === 'default title') return null
  if (COLOR_ALIASES[n]) return COLOR_ALIASES[n]
  // "Matte Black", "Black Leather" — try the last then first word
  const words = n.split(' ')
  if (words.length > 1) {
    const last = COLOR_ALIASES[words[words.length - 1]]
    if (last) return last
    const first = COLOR_ALIASES[words[0]]
    if (first) return first
  }
  return null
}

/** Canonicalise a colour VALUE that may be combined ("Black/Red"). */
export function canonicalColors(raw: string | null | undefined): string[] {
  const s = String(raw ?? '').trim()
  if (!s) return []
  const parts = s.split(/[/,+&]/).map((p) => canonicalColor(p)).filter((p): p is string => p !== null)
  return [...new Set(parts)]
}

// ── Material (values, e.g. the jewellery "metal" axis) ───────────────────────
const MATERIAL_VALUE_ALIASES: Record<string, string> = {
  cotton: 'cotton', baumwolle: 'cotton', 'organic cotton': 'cotton',
  leather: 'leather', leder: 'leather', 'faux leather': 'vegan-leather', 'vegan leather': 'vegan-leather', kunstleder: 'vegan-leather',
  silicone: 'silicone', silikon: 'silicone', latex: 'latex', rubber: 'rubber', gummi: 'rubber', neoprene: 'rubber',
  mesh: 'mesh', lace: 'lace', spitze: 'lace', satin: 'satin', denim: 'denim', wool: 'wool', wolle: 'wool',
  nylon: 'nylon', spandex: 'spandex', elastane: 'spandex', elasthan: 'spandex', lycra: 'spandex',
  bamboo: 'bamboo', modal: 'modal',
  'stainless steel': 'stainless-steel', edelstahl: 'stainless-steel', steel: 'stainless-steel', titanium: 'stainless-steel',
  silver: 'silver', 'sterling silver': 'silver', silber: 'silver',
  gold: 'gold', 'yellow gold': 'gold', 'rose gold': 'gold', 'white gold': 'gold', vermeil: 'gold', 'gold filled': 'gold', 'gold plated': 'gold',
  glass: 'glass', glas: 'glass', wood: 'wood', holz: 'wood', ceramic: 'ceramic', keramik: 'ceramic',
  metal: 'metal', metall: 'metal', brass: 'metal', bronze: 'metal', aluminium: 'metal', aluminum: 'metal', chrome: 'metal',
}

export function canonicalMaterial(raw: string | null | undefined): string | null {
  const n = String(raw ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (!n || n === 'default title') return null
  if (MATERIAL_VALUE_ALIASES[n]) return MATERIAL_VALUE_ALIASES[n]
  const words = n.split(' ')
  if (words.length > 1) {
    const last = MATERIAL_VALUE_ALIASES[words[words.length - 1]]
    if (last) return last
  }
  return null
}

// ── Shopify products (options[] + variants[] retained in raw) ────────────────
interface ShopifyOptionRaw { name?: string; position?: number; values?: string[] }
interface ShopifyVariantRaw {
  id?: number | string
  title?: string
  sku?: string
  price?: string | number
  available?: boolean
  inventory_quantity?: number
  option1?: string | null
  option2?: string | null
  option3?: string | null
  position?: number
  featured_image?: { src?: string } | null
}

export function extractShopifyVariants(raw: Record<string, unknown>, currency?: string | null): VariantExtractResult {
  const options = (Array.isArray(raw.options) ? raw.options : []) as ShopifyOptionRaw[]
  const variants = (Array.isArray(raw.variants) ? raw.variants : []) as ShopifyVariantRaw[]
  const axes: Array<VariantAxis | null> = [0, 1, 2].map((i) => mapOptionName(options[i]?.name))
  const optionNames: string[] = [0, 1, 2].map((i) => String(options[i]?.name ?? `option${i + 1}`))

  const out: ExtractedVariant[] = []
  const sizes = new Set<string>()
  const colors = new Set<string>()
  const materials = new Set<string>()

  for (const v of variants) {
    const values = [v.option1, v.option2, v.option3]
    const opts: Record<string, string> = {}
    let sizeRaw: string | null = null
    let colorRaw: string | null = null
    let materialRaw: string | null = null
    for (let i = 0; i < 3; i++) {
      const val = values[i]
      if (val == null || val === '') continue
      opts[optionNames[i]] = String(val)
      if (axes[i] === 'size' && sizeRaw === null) sizeRaw = String(val)
      if (axes[i] === 'color' && colorRaw === null) colorRaw = String(val)
      if (axes[i] === 'material' && materialRaw === null) materialRaw = String(val)
    }
    // Shopify's single-variant placeholder carries no variant information.
    const isPlaceholder = variants.length === 1 && String(v.title ?? '').trim().toLowerCase() === 'default title'
    if (isPlaceholder) continue

    const vSizes = canonicalSizes(sizeRaw)
    const vColors = canonicalColors(colorRaw)
    const vMaterial = canonicalMaterial(materialRaw)
    vSizes.forEach((s) => sizes.add(s))
    vColors.forEach((c) => colors.add(c))
    if (vMaterial) materials.add(vMaterial)

    const price = v.price != null && `${v.price}`.trim() !== '' ? Number(v.price) : null
    out.push({
      source_variant_id: v.id != null ? String(v.id) : null,
      sku: v.sku?.trim() || null,
      title: v.title?.trim() || null,
      option_size: vSizes[0] ?? null,
      option_size_raw: sizeRaw,
      option_color: vColors[0] ?? null,
      option_color_raw: colorRaw,
      option_material: vMaterial,
      options: opts,
      price: price != null && Number.isFinite(price) ? price : null,
      currency: currency ?? null,
      available: typeof v.available === 'boolean' ? v.available : (typeof v.inventory_quantity === 'number' ? v.inventory_quantity > 0 : null),
      inventory_quantity: typeof v.inventory_quantity === 'number' ? v.inventory_quantity : null,
      position: typeof v.position === 'number' ? v.position : null,
      image_url: v.featured_image?.src ?? null,
    })
  }

  const attributes: ExtractedAttributes = {}
  if (sizes.size) attributes.size = [...sizes].sort()
  if (colors.size) attributes.color = [...colors].sort()
  if (materials.size) attributes.material = [...materials].sort()
  return { variants: out, attributes }
}

// ── Etsy inventory (needs includes=Inventory on source-etsy) ─────────────────
interface EtsyPropertyValue { property_name?: string; values?: string[] }
interface EtsyOffering { price?: { amount?: number; divisor?: number; currency_code?: string }; quantity?: number; is_enabled?: boolean }
interface EtsyProduct { product_id?: number; sku?: string; property_values?: EtsyPropertyValue[]; offerings?: EtsyOffering[] }

export function extractEtsyVariants(raw: Record<string, unknown>): VariantExtractResult {
  const inv = (raw.inventory ?? {}) as Record<string, unknown>
  const products = (Array.isArray(inv.products) ? inv.products : []) as EtsyProduct[]
  const out: ExtractedVariant[] = []
  const sizes = new Set<string>()
  const colors = new Set<string>()

  for (const p of products) {
    const opts: Record<string, string> = {}
    let sizeRaw: string | null = null
    let colorRaw: string | null = null
    for (const pv of p.property_values ?? []) {
      const axis = mapOptionName(pv.property_name)
      const val = (pv.values ?? []).join(' / ')
      if (!val) continue
      opts[String(pv.property_name ?? 'property')] = val
      if (axis === 'size' && sizeRaw === null) sizeRaw = val
      if (axis === 'color' && colorRaw === null) colorRaw = val
    }
    const offering = (p.offerings ?? [])[0]
    const amount = offering?.price?.amount
    const divisor = offering?.price?.divisor || 100
    const vSizes = canonicalSizes(sizeRaw)
    const vColors = canonicalColors(colorRaw)
    vSizes.forEach((s) => sizes.add(s))
    vColors.forEach((c) => colors.add(c))
    out.push({
      source_variant_id: p.product_id != null ? String(p.product_id) : null,
      sku: p.sku?.trim() || null,
      title: Object.values(opts).join(' / ') || null,
      option_size: vSizes[0] ?? null,
      option_size_raw: sizeRaw,
      option_color: vColors[0] ?? null,
      option_color_raw: colorRaw,
      option_material: null,
      options: opts,
      price: typeof amount === 'number' ? amount / divisor : null,
      currency: offering?.price?.currency_code ?? null,
      available: typeof offering?.is_enabled === 'boolean' ? offering.is_enabled : null,
      inventory_quantity: typeof offering?.quantity === 'number' ? offering.quantity : null,
      position: null,
      image_url: null,
    })
  }

  const attributes: ExtractedAttributes = {}
  if (sizes.size) attributes.size = [...sizes].sort()
  if (colors.size) attributes.color = [...colors].sort()
  return { variants: out, attributes }
}

// ── Feed sources (AWIN-style CSV rows: listing-level only, no variants) ──────
export function extractFeedAttributes(raw: Record<string, unknown>): ExtractedAttributes {
  const attributes: ExtractedAttributes = {}
  const colour = canonicalColors(String(raw.colour ?? raw.color ?? ''))
  if (colour.length) attributes.color = colour
  const condition = String(raw.condition ?? '').trim().toLowerCase()
  if (['new', 'used', 'refurbished'].includes(condition)) attributes.condition = condition
  const dimensions = String(raw.dimensions ?? '').trim()
  if (dimensions) attributes.dimensions = dimensions.slice(0, 120)
  const gtin = String(raw.ean ?? raw.gtin ?? raw.upc ?? '').trim()
  if (/^\d{8,14}$/.test(gtin)) attributes.gtin = gtin
  return attributes
}

// ── Genre (books/film groups only — context-gated by the caller) ─────────────
const GENRE_RULES: Array<[RegExp, string]> = [
  [/\b(memoir|memoiren|autobiograph\w*)\b/i, 'memoir'],
  [/\b(biograph\w*|biografie\w*)\b/i, 'biography'],
  [/\b(poetry|poems?|gedichte?|lyrik)\b/i, 'poetry'],
  [/\b(romance|liebesroman\w*)\b/i, 'romance'],
  [/\b(sci[- ]?fi|science[- ]?fiction|fantasy)\b/i, 'scifi-fantasy'],
  [/\b(horror)\b/i, 'horror'],
  [/\b(mystery|thriller|krimi\w*)\b/i, 'mystery-thriller'],
  [/\b(comics?|graphic novels?|manga)\b/i, 'comics'],
  [/\b(young adult|jugendbuch\w*)\b/i, 'ya'],
  [/\b(children\w*|kinderbuch\w*|picture book|bilderbuch\w*)\b/i, 'kids'],
  [/\b(history|geschichte|historical)\b/i, 'history'],
  [/\b(essays?)\b/i, 'essays'],
  [/\b(queer (theory|studies)|queer[- ]?theorie)\b/i, 'queer-theory'],
  [/\b(photo ?book|bildband|photography|art book|kunstband)\b/i, 'art-photography'],
  [/\b(erotic\w*|erotik\w*)\b/i, 'erotica'],
  [/\b(novels?|fiction|romane?)\b/i, 'fiction'],
]

export function extractGenre(title: string | null | undefined, description: string | null | undefined, subcategoryGroup: string | null | undefined): string[] {
  if (!['books', 'film'].includes(subcategoryGroup ?? '')) return []
  const txt = `${title ?? ''} ${description ?? ''}`
  const found = new Set<string>()
  for (const [rx, slug] of GENRE_RULES) {
    if (rx.test(txt)) found.add(slug)
  }
  // fiction is the weakest rule — drop it when a more specific genre matched.
  if (found.size > 1) found.delete('fiction')
  return [...found].sort()
}

// ── Fit — GARMENT CUT ONLY, derived from explicit merchant labels; never from
//    imagery, model presentation, or identity vocabulary (vocab guardrail,
//    migration 20260926100300). ──────────────────────────────────────────────
const FIT_RULES: Array<[RegExp, string]> = [
  [/\b(men'?s (fit|cut|sizing)|herrenschnitt|male fit)\b/i, 'masc-cut'],
  [/\b(women'?s (fit|cut|sizing)|damenschnitt|female fit)\b/i, 'femme-cut'],
  [/\b(unisex)\b/i, 'unisex'],
  [/\b(compression|kompression\w*)\b/i, 'compression'],
  [/\b(adaptive)\b/i, 'adaptive'],
  [/\b(petite (fit|size|cut))\b/i, 'petite'],
  [/\b(tall (fit|size|cut))\b/i, 'tall'],
]

export function extractFit(title: string | null | undefined, description: string | null | undefined): string[] {
  const txt = `${title ?? ''} ${description ?? ''}`
  const found = new Set<string>()
  for (const [rx, slug] of FIT_RULES) {
    if (rx.test(txt)) found.add(slug)
  }
  return [...found].sort()
}

// ── Roll-up: merge variant-derived + listing-level attributes ────────────────
export function mergeAttributes(...parts: ExtractedAttributes[]): ExtractedAttributes {
  const out: ExtractedAttributes = {}
  const arrays: Array<keyof Pick<ExtractedAttributes, 'size' | 'color' | 'material' | 'genre' | 'fit'>> = ['size', 'color', 'material', 'genre', 'fit']
  for (const key of arrays) {
    const merged = new Set<string>()
    for (const p of parts) (p[key] ?? []).forEach((v) => merged.add(v))
    if (merged.size) out[key] = [...merged].sort()
  }
  for (const p of parts) {
    if (p.condition && !out.condition) out.condition = p.condition
    if (p.dimensions && !out.dimensions) out.dimensions = p.dimensions
    if (p.gtin && !out.gtin) out.gtin = p.gtin
  }
  return out
}

/** Stable deep-equal for the attributes jsonb (arrays are sorted by construction). */
export function attributesEqual(a: unknown, b: ExtractedAttributes): boolean {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b))
}
function normalizeForCompare(v: unknown): unknown {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return v
  const rec = v as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(rec).sort()) {
    const val = rec[k]
    out[k] = Array.isArray(val) ? [...(val as string[])].sort() : val
  }
  return out
}
