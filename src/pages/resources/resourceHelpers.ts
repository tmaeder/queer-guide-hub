export type ViewMode =
  | 'overview'
  | 'category'
  | 'subcategory'
  | 'search'
  | 'tag-detail'
  | 'professions'
  | 'graph'
  | 'not-found';

export type DisplayMode = 'chips' | 'grid' | 'list';

export type SortOption = 'alphabetical' | 'usage' | 'recent';

/**
 * P2-4 — "Has image" filter must exclude gradient placeholders. Without
 * width/height/MIME info on the client, use a URL heuristic: require an
 * http(s) or storage path, reject data: URIs and obvious placeholder
 * markers in the path. False negatives (real images named "*placeholder*")
 * are acceptable; false positives (gradient placeholders showing up
 * under "Has image") are not.
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

// ─────────────── Shared hover-card class ───────────────
export const hoverCardCls =
  'flex items-center gap-3 px-4 py-3 rounded-element cursor-pointer bg-background text-left text-inherit w-full transition-all duration-150 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary border-0';
