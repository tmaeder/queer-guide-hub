/**
 * The /tags URL contract.
 *
 * One place decides what a param means, what its default is, and what a stale
 * or malformed value collapses to. The page this replaces spread that across a
 * canonicalisation effect, six inline `searchParams.get(...) ?? default` reads
 * and six setters that each had to remember to omit its own default.
 *
 * Two structural changes from the old contract:
 *
 * - **The category lives in the path**, not the query. `?cat=<name>`,
 *   `?category=<name>` and `/tags/c/<slug>` were three spellings of the same
 *   filter, reconciled by a 40-line effect that also flipped a view mode. The
 *   two query forms are now legacy inputs that resolve to a redirect.
 * - **The graph is a view**, not component state. It was unshareable and Back
 *   could not leave it.
 *
 * Defaults are omitted from the URL on write AND stripped on read, so a shared
 * link like `/tags?sort=usage&dir=desc&view=grid&usage=all&hasImage=0`
 * collapses to `/tags`.
 */

export const TAG_VIEWS = ['grid', 'list', 'chips', 'graph'] as const;
export type TagView = (typeof TAG_VIEWS)[number];

/** Names kept verbatim from the old contract — the e2e suite asserts them. */
export const TAG_SORTS = ['usage', 'alphabetical', 'recent'] as const;
export type TagSort = (typeof TAG_SORTS)[number];

export const TAG_USAGE_FILTERS = ['all', 'used', 'unused'] as const;
export type TagUsageFilter = (typeof TAG_USAGE_FILTERS)[number];

/** `#` collects every term whose first character is not A–Z (digits, symbols,
 *  and any non-Latin script — the glossary has entries in several). */
export const LETTER_OTHER = '#';
export const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', LETTER_OTHER] as const;

export interface TagsIndexState {
  q: string;
  view: TagView;
  sort: TagSort;
  dir: 'asc' | 'desc';
  letter: string | null;
  usage: TagUsageFilter;
  hasImage: boolean;
  /** Opt in to 18+ terms. Absent means safe mode's verdict stands. */
  adult: boolean;
}

export const DEFAULT_TAGS_STATE: TagsIndexState = {
  q: '',
  view: 'grid',
  sort: 'usage',
  dir: 'desc',
  letter: null,
  usage: 'all',
  hasImage: false,
  adult: false,
};

/** The search RPC is a network call per keystroke; below this the instant
 *  client-side filter is both faster and better (a 1-char trigram match is
 *  noise anyway). */
export const MIN_SERVER_QUERY = 2;

function oneOf<T extends string>(options: readonly T[], raw: string | null, fallback: T): T {
  return options.includes(raw as T) ? (raw as T) : fallback;
}

export interface ParsedTagsParams {
  state: TagsIndexState;
  /** The URL carried a key at its default, or an unrecognised enum value. The
   *  caller rewrites with `replace: true` so the address bar stays clean. */
  changed: boolean;
  /** A legacy param that is now expressed as a route. */
  redirectTo?: string;
}

/**
 * @param resolveCategorySlug maps a legacy `?cat=`/`?category=` value (which
 *   may be a category NAME or a slug) to a slug. Returns null while the
 *   category tree is still loading, in which case the legacy param is left
 *   alone and re-examined on the next render rather than silently dropped.
 */
export function parseTagsParams(
  searchParams: URLSearchParams,
  resolveCategorySlug?: (value: string) => string | null,
): ParsedTagsParams {
  const state: TagsIndexState = {
    q: (searchParams.get('q') ?? '').slice(0, 100),
    view: oneOf(TAG_VIEWS, searchParams.get('view'), DEFAULT_TAGS_STATE.view),
    sort: oneOf(TAG_SORTS, searchParams.get('sort'), DEFAULT_TAGS_STATE.sort),
    dir: searchParams.get('dir') === 'asc' ? 'asc' : 'desc',
    letter: normalizeLetter(searchParams.get('letter')),
    usage: oneOf(TAG_USAGE_FILTERS, searchParams.get('usage'), DEFAULT_TAGS_STATE.usage),
    hasImage: searchParams.get('hasImage') === '1',
    adult: searchParams.get('adult') === '1',
  };

  // ── Legacy forms ────────────────────────────────────────────────────────
  // `?profession=X` used to force a tag-NAME search for the profession string,
  // which searches the wrong noun entirely. /personalities has a real
  // profession facet.
  const profession = searchParams.get('profession');
  if (profession?.trim()) {
    return {
      state,
      changed: false,
      redirectTo: `/personalities?profession=${encodeURIComponent(profession.trim())}`,
    };
  }

  const legacyCategory = searchParams.get('cat') ?? searchParams.get('category');
  if (legacyCategory?.trim() && legacyCategory !== 'all') {
    const slug = resolveCategorySlug?.(decodeURIComponent(legacyCategory.trim()));
    if (slug) {
      const rest = serializeTagsParams(state);
      const qs = rest.toString();
      return { state, changed: false, redirectTo: `/tags/c/${slug}${qs ? `?${qs}` : ''}` };
    }
    // Tree not loaded yet (or an unknown category). Hold the param so a later
    // render can still resolve it; do not report `changed`, which would strip
    // it before it was ever read.
    return { state, changed: false };
  }

  // ── Canonicalisation ────────────────────────────────────────────────────
  const canonical = serializeTagsParams(state);
  // Compare against the input restricted to keys we own, so unrelated params
  // (analytics, campaign tags) are neither counted as drift nor destroyed.
  const owned = new URLSearchParams();
  for (const key of OWNED_KEYS) {
    const v = searchParams.get(key);
    if (v !== null) owned.set(key, v);
  }
  const changed = owned.toString() !== canonical.toString();

  return { state, changed };
}

const OWNED_KEYS = ['q', 'view', 'sort', 'dir', 'letter', 'usage', 'hasImage', 'adult'] as const;

export function serializeTagsParams(state: TagsIndexState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set('q', state.q);
  if (state.view !== DEFAULT_TAGS_STATE.view) p.set('view', state.view);
  if (state.sort !== DEFAULT_TAGS_STATE.sort) p.set('sort', state.sort);
  if (state.dir === 'asc') p.set('dir', 'asc');
  if (state.letter) p.set('letter', state.letter);
  if (state.usage !== DEFAULT_TAGS_STATE.usage) p.set('usage', state.usage);
  if (state.hasImage) p.set('hasImage', '1');
  if (state.adult) p.set('adult', '1');
  return p;
}

/** Merge the owned keys into an existing query string, preserving anything the
 *  page does not own. */
export function applyTagsParams(previous: URLSearchParams, state: TagsIndexState): URLSearchParams {
  const next = new URLSearchParams(previous);
  for (const key of OWNED_KEYS) next.delete(key);
  // These only ever exist to be redirected away from; carrying them forward
  // would re-trigger the redirect on every subsequent interaction.
  next.delete('cat');
  next.delete('category');
  next.delete('profession');
  for (const [k, v] of serializeTagsParams(state)) next.append(k, v);
  return next;
}

export function normalizeLetter(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.toUpperCase();
  return (ALPHABET as readonly string[]).includes(v) ? v : null;
}

/** Which letter section a term files under. */
export function letterFor(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : LETTER_OTHER;
}

/**
 * Whether a tag's `image_url` is a real editorial image rather than a gradient
 * placeholder. Moved verbatim from the deleted resourceHelpers so the "with
 * image" filter and the card's fallback plate agree on one definition.
 *
 * Without width/height/MIME on the client this is a URL heuristic: require an
 * http(s) or storage path, reject data: URIs and obvious placeholder markers.
 * False negatives (a real image named "*placeholder*") are acceptable; false
 * positives (a gradient showing up under "With image") are not.
 */
export function isRealTagImage(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith('data:')) return false;
  const lower = trimmed.toLowerCase();
  if (lower.includes('placeholder') || lower.includes('gradient')) return false;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/');
}

export function hasActiveFilters(state: TagsIndexState): boolean {
  return (
    !!state.q.trim() ||
    state.letter !== null ||
    state.usage !== DEFAULT_TAGS_STATE.usage ||
    state.hasImage ||
    state.sort !== DEFAULT_TAGS_STATE.sort ||
    state.dir !== DEFAULT_TAGS_STATE.dir
  );
}
