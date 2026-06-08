// Amenity Truth Engine — shared normalizer.
// Category-aware, DB-backed generalization of hotel-pipeline-utils.ts:normalizeAmenities.
// Classifies a raw scraped term into one of:
//   amenity        -> venues.amenities[] / hotels.amenities[]
//   accessibility  -> venues.accessibility_attributes[]
//   queer          -> venues.tags[] (LGBTQ+ markers)
//   noise          -> dropped (TripAdvisor atmosphere/cuisine/location pollution)
//
// The canonical vocabulary lives in the public.amenities table (kind discriminates).
// Anything not in the vocabulary (and not aliased) is dropped — default-reject keeps
// the 2,020-distinct-value venue mess from leaking back in.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { detectLgbtqMarkers } from './hotel-pipeline-utils.ts'

export type AmenityKind = 'amenity' | 'accessibility' | 'queer'

export interface AmenityVocab {
  /** slug -> { kind, scope } for every active vocabulary term. */
  bySlug: Map<string, { kind: AmenityKind; scope: string[] }>
  amenity: Set<string>
  accessibility: Set<string>
  queer: Set<string>
}

export type TermClass =
  | { kind: AmenityKind; slug: string }
  | { kind: 'noise' }

// ── Alias maps (raw term -> canonical slug) ─────────────────────────────────
// Keys are matched against both the lowercased raw string and its slug form.
const AMENITY_ALIASES: Record<string, string> = {
  // connectivity / comfort
  'free wifi': 'wifi', 'wireless internet': 'wifi', 'internet': 'wifi', 'wi-fi': 'wifi', 'wlan': 'wifi',
  'free parking': 'parking', 'car park': 'parking', 'garage': 'parking', 'valet parking': 'parking',
  'a/c': 'air-conditioning', 'ac': 'air-conditioning', 'aircon': 'air-conditioning', 'climate control': 'air-conditioning',
  'central heating': 'heating', 'heated': 'heating',
  'no smoking': 'smoke-free', 'non smoking': 'smoke-free', 'non-smoking': 'smoke-free',
  'ev charger': 'ev-charging', 'electric car charging': 'ev-charging', 'charging station': 'ev-charging',
  'pet friendly': 'pets-allowed', 'dogs allowed': 'pets-allowed', 'pet-friendly': 'pets-allowed', 'dog friendly': 'pets-allowed',
  'kid friendly': 'family-friendly', 'kids welcome': 'family-friendly', 'child friendly': 'family-friendly',
  'over 18': 'adults-only', '18+': 'adults-only', '21+': 'adults-only',
  // food & drink
  'outdoor seating': 'outdoor-seating', 'patio': 'outdoor-seating', 'terrace seating': 'outdoor-seating', 'sidewalk seating': 'outdoor-seating', 'al fresco': 'outdoor-seating',
  'garden': 'garden-terrace', 'terrace': 'garden-terrace', 'rooftop': 'garden-terrace',
  'tv': 'tv-screens', 'televisions': 'tv-screens', 'sports tv': 'tv-screens', 'big screen': 'tv-screens',
  'bar': 'full-bar', 'cocktail bar': 'full-bar', 'liquor': 'full-bar', 'alcohol': 'full-bar', 'full service bar': 'full-bar',
  'cocktail': 'cocktails', 'craft cocktails': 'cocktails',
  'beer on tap': 'beer', 'craft beer': 'beer', 'draft beer': 'beer', 'cider': 'beer', 'breweries': 'beer',
  'espresso': 'coffee', 'cafe': 'coffee',
  'food': 'food-service', 'serves food': 'food-service', 'snacks': 'food-service', 'small plates': 'food-service',
  'breakfast included': 'breakfast', 'free breakfast': 'breakfast', 'continental breakfast': 'breakfast',
  'kitchenette': 'kitchen', 'full kitchen': 'kitchen', 'cooking facilities': 'kitchen',
  'happy hour': 'happy-hour', 'drink specials': 'happy-hour',
  // entertainment
  'dancefloor': 'dance-floor', 'dancing': 'dance-floor', 'dj': 'dance-floor',
  'music': 'live-music', 'live bands': 'live-music', 'concerts': 'live-music',
  'drag': 'drag-shows', 'drag show': 'drag-shows', 'drag performances': 'drag-shows', 'cabaret': 'drag-shows',
  'karaoke night': 'karaoke',
  'pool table': 'pool-table', 'billiards': 'pool-table', 'snooker': 'pool-table',
  // sauna / wellness
  'finnish sauna': 'sauna', 'dry sauna': 'sauna',
  'jacuzzi': 'hot-tub', 'whirlpool': 'hot-tub', 'hot tub': 'hot-tub',
  'swimming pool': 'pool', 'outdoor pool': 'pool', 'indoor pool': 'pool', 'heated pool': 'pool',
  'steam bath': 'steam-room', 'hammam': 'steam-room', 'steamroom': 'steam-room',
  'dark room': 'darkroom', 'play area': 'darkroom', 'play room': 'darkroom',
  'cruising': 'cruising-area', 'cruising maze': 'cruising-area', 'maze': 'cruising-area',
  'cabins': 'private-cabins', 'private rooms': 'private-cabins', 'private cabins': 'private-cabins',
  'locker': 'lockers', 'lockers available': 'lockers',
  'fitness center': 'gym', 'fitness centre': 'gym', 'fitness room': 'gym', 'gym nearby': 'gym', 'gym-nearby': 'gym', 'workout room': 'gym',
  // lodging
  'spa services': 'spa', 'massage': 'spa', 'wellness': 'spa',
  'room service': 'room-service',
  'washing machine': 'laundry', 'washer': 'laundry', 'dryer': 'laundry', 'laundry service': 'laundry',
  'ensuite': 'private-bathroom', 'en-suite': 'private-bathroom', 'en suite': 'private-bathroom',
  'beach': 'beach-access', 'beachfront': 'beach-access',
  'shuttle': 'airport-shuttle', 'airport transfer': 'airport-shuttle', 'airport pickup': 'airport-shuttle',
}

const ACCESSIBILITY_ALIASES: Record<string, string> = {
  'accessible': 'wheelchair-accessible', 'ada': 'wheelchair-accessible', 'ada compliant': 'wheelchair-accessible',
  'wheelchair access': 'wheelchair-accessible', 'wheelchair accessible entrance': 'wheelchair-accessible',
  'disabled access': 'wheelchair-accessible', 'handicap accessible': 'wheelchair-accessible',
  'step free': 'step-free-entrance', 'step-free': 'step-free-entrance', 'no steps': 'step-free-entrance',
  'level entrance': 'step-free-entrance', 'ramp': 'step-free-entrance', 'ramp access': 'step-free-entrance', 'elevator': 'step-free-entrance', 'lift': 'step-free-entrance',
  'accessible restroom': 'accessible-restroom', 'accessible bathroom': 'accessible-restroom',
  'accessible toilet': 'accessible-restroom', 'wheelchair accessible restroom': 'accessible-restroom',
  'gender neutral restroom': 'gender-neutral-restroom', 'gender neutral bathroom': 'gender-neutral-restroom',
  'all gender restroom': 'gender-neutral-restroom', 'unisex restroom': 'gender-neutral-restroom', 'gender neutral toilets': 'gender-neutral-restroom',
  'accessible parking': 'accessible-parking', 'disabled parking': 'accessible-parking', 'handicap parking': 'accessible-parking',
  'wide doorways': 'wide-doorways', 'wide doors': 'wide-doorways',
  'braille': 'braille-menu', 'braille menu': 'braille-menu',
  'hearing loop': 'hearing-loop', 'induction loop': 'hearing-loop', 'assistive listening': 'hearing-loop',
  'service animal': 'service-animals-welcome', 'service animals': 'service-animals-welcome', 'guide dog': 'service-animals-welcome', 'assistance dog': 'service-animals-welcome',
}

const QUEER_ALIASES: Record<string, string> = {
  'lgbtq owned': 'lgbtq-owned', 'lgbt owned': 'lgbtq-owned', 'queer owned': 'lgbtq-owned',
  'gay owned': 'gay-owned', 'lesbian owned': 'lesbian-owned', 'trans owned': 'trans-owned',
  'gay friendly': 'queer-friendly', 'lgbtq friendly': 'queer-friendly', 'lgbt friendly': 'queer-friendly', 'queer friendly': 'queer-friendly',
  'trans friendly': 'trans-friendly',
  'gay staff': 'lgbtq-staff', 'lgbtq staff': 'lgbtq-staff',
  'clothing optional': 'clothing-optional', 'clothing optional accepted': 'clothing-optional', 'nudism allowed': 'clothing-optional', 'naked': 'clothing-optional', 'nude': 'clothing-optional',
  'men only': 'men-only', "men's only": 'men-only', 'males only': 'men-only',
  'women only': 'women-only', "women's only": 'women-only', 'females only': 'women-only',
}

// Noise we drop on sight. The default-reject in classifyTerm already drops anything
// unknown; these patterns mainly document intent and keep `dropped[]` meaningful.
const NOISE_PATTERNS: RegExp[] = [
  /^good-for-/,         // good-for-groups, good-for-dates, good-for-a-quick-meal
  /-food$/,             // brunch-food, breakfast-food, healthy-food, spicy-food
  /^great-value$/, /^authentic$/, /^scenic-views$/,
  /local-tips$/,        // host-shares-gay-local-tips, happy-to-share-local-tips
  /venues-nearby$/,     // lgbtq-venues-nearby
  /^gay-district$/, /^gay-village$/,
]

export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Classify a single raw term against the loaded vocabulary. */
export function classifyTerm(raw: string, vocab: AmenityVocab): TermClass {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return { kind: 'noise' }
  const slug = slugify(s)
  if (!slug) return { kind: 'noise' }
  // Scraped data is often already hyphen-slugged; alias maps are written space-form.
  // Try raw, slug, and the spaced form of the slug.
  const spaced = slug.replace(/-/g, ' ')
  const lookup = (m: Record<string, string>): string | undefined => m[s] ?? m[slug] ?? m[spaced]

  if (NOISE_PATTERNS.some((rx) => rx.test(slug))) return { kind: 'noise' }

  // accessibility first (safety-relevant), then queer, then amenity.
  const acc = lookup(ACCESSIBILITY_ALIASES)
  if (acc && vocab.accessibility.has(acc)) return { kind: 'accessibility', slug: acc }
  if (vocab.accessibility.has(slug)) return { kind: 'accessibility', slug }

  const q = lookup(QUEER_ALIASES)
  if (q && vocab.queer.has(q)) return { kind: 'queer', slug: q }
  if (vocab.queer.has(slug)) return { kind: 'queer', slug }

  const am = lookup(AMENITY_ALIASES)
  if (am && vocab.amenity.has(am)) return { kind: 'amenity', slug: am }
  if (vocab.amenity.has(slug)) return { kind: 'amenity', slug }

  return { kind: 'noise' }
}

export interface NormalizeInput {
  amenities?: unknown
  tags?: unknown
  description?: unknown
  category?: string | null
}

export interface NormalizeResult {
  amenities: string[]
  accessibility: string[]
  queerTags: string[]
  dropped: string[]
}

function toList(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map((x) => String(x ?? ''))
  return String(raw).split(/[;,|]+/)
}

/**
 * Re-classify a venue/hotel's raw amenity + tag blob into clean canonical buckets.
 * Splits accessibility out of amenities and routes LGBTQ+ markers to tags.
 */
export function normalizeVenueAmenities(input: NormalizeInput, vocab: AmenityVocab): NormalizeResult {
  const amenity = new Set<string>()
  const accessibility = new Set<string>()
  const queer = new Set<string>()
  const dropped = new Set<string>()

  for (const term of [...toList(input.amenities), ...toList(input.tags)]) {
    const t = term.trim()
    if (!t) continue
    const c = classifyTerm(t, vocab)
    if (c.kind === 'amenity') amenity.add(c.slug)
    else if (c.kind === 'accessibility') accessibility.add(c.slug)
    else if (c.kind === 'queer') queer.add(c.slug)
    else dropped.add(t.toLowerCase())
  }

  // Description / tag-derived LGBTQ+ markers (reuse existing detector), keep only
  // markers that exist in the controlled queer vocabulary.
  for (const m of detectLgbtqMarkers(input.tags, input.description)) {
    const mapped = QUEER_ALIASES[m] ?? m
    if (vocab.queer.has(mapped)) queer.add(mapped)
  }

  return {
    amenities: [...amenity].sort(),
    accessibility: [...accessibility].sort(),
    queerTags: [...queer].sort(),
    dropped: [...dropped].sort(),
  }
}

/** Build a vocabulary object from raw amenities-table rows (no DB needed — testable). */
export function buildVocab(rows: Array<{ slug: string; kind: string; category_scope?: string[] }>): AmenityVocab {
  const bySlug = new Map<string, { kind: AmenityKind; scope: string[] }>()
  const amenity = new Set<string>()
  const accessibility = new Set<string>()
  const queer = new Set<string>()
  for (const r of rows) {
    if (!r?.slug) continue
    const kind = (r.kind as AmenityKind) ?? 'amenity'
    bySlug.set(r.slug, { kind, scope: r.category_scope ?? ['all'] })
    if (kind === 'amenity') amenity.add(r.slug)
    else if (kind === 'accessibility') accessibility.add(r.slug)
    else if (kind === 'queer') queer.add(r.slug)
  }
  return { bySlug, amenity, accessibility, queer }
}

let _cache: AmenityVocab | null = null

/** Load + cache the controlled vocabulary from public.amenities. */
export async function loadAmenityVocabulary(supabase: SupabaseClient, force = false): Promise<AmenityVocab> {
  if (_cache && !force) return _cache
  const { data, error } = await supabase
    .from('amenities')
    .select('slug, kind, category_scope')
    .eq('is_active', true)
  if (error) throw new Error(`loadAmenityVocabulary: ${error.message}`)
  _cache = buildVocab((data ?? []) as Array<{ slug: string; kind: string; category_scope?: string[] }>)
  return _cache
}
