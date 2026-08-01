/**
 * Shared types and pure helpers for ContentListPanel.
 */

export interface ListItem {
  id: string;
  title: string;
  description?: string;
  updatedAt?: string;
  contentType: string;
  contentTypeLabel: string;
  contentTypeColor: string;
  status?: string;
  raw?: Record<string, unknown>;
}

export type SortField = string;
export type SortDir = 'asc' | 'desc';

export type DateRange = { from?: string; to?: string };
export type NumberRange = { min?: number; max?: number };
export type FilterValue = string | boolean | DateRange | NumberRange | undefined;
export type FilterState = Record<string, FilterValue>;

/** Views every content type gets. Table is the default and always available. */
export type ContentView = 'table' | 'gallery' | 'board' | 'timeline' | 'calendar';

export interface PersistedState {
  /** Remembered per content type, so a chosen view survives navigation. */
  view?: ContentView;
  /** Board grouping column, remembered alongside the view. */
  groupBy?: string | null;
  /** Column the date views plot against, remembered alongside the view. */
  dateField?: string | null;
  sortField?: SortField;
  sortDir?: SortDir;
  filters?: FilterState;
  hiddenColumns?: string[];
}

export function loadPersistedState(key: string): PersistedState | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Takes PersistedState so a new remembered key needs one edit, not two. */
export function persistState(key: string, state: PersistedState) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* sessionStorage unavailable */
  }
}

export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  const d = new Date(dateStr);
  const thisYear = new Date().getFullYear();
  if (d.getFullYear() === thisYear) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

import type { ContentTypeConfig } from '@/types/cms';

/** Get the status/workflow field value from raw row data. */
export function extractStatus(
  row: Record<string, unknown>,
  _ct: ContentTypeConfig,
): string | undefined {
  if ('workflow_state' in row && typeof row.workflow_state === 'string') return row.workflow_state;
  if ('status' in row && typeof row.status === 'string') return row.status;
  if ('visibility' in row && typeof row.visibility === 'string') return row.visibility;
  if ('verification_status' in row && typeof row.verification_status === 'string')
    return row.verification_status;
  return undefined;
}

/**
 * The token expression for a status, WITHOUT the hsl() wrapper, so callers can
 * compose an alpha instead of concatenating one onto a finished colour.
 */
function statusToken(status: string | undefined): { token: string; alpha: number } | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (['published', 'active', 'public', 'verified'].includes(s))
    return { token: 'var(--foreground)', alpha: 1 };
  if (['draft', 'pending'].includes(s)) return { token: 'var(--muted-foreground)', alpha: 1 };
  if (['review', 'restricted'].includes(s)) return { token: 'var(--foreground)', alpha: 0.55 };
  if (['archived', 'expired', 'sold', 'completed', 'rejected'].includes(s))
    return { token: 'var(--muted-foreground)', alpha: 1 };
  if (['cancelled'].includes(s)) return { token: 'var(--destructive)', alpha: 1 };
  return { token: 'var(--muted-foreground)', alpha: 1 };
}

export function getStatusColor(status: string | undefined): string {
  const t = statusToken(status);
  if (!t) return 'transparent';
  return t.alpha === 1 ? `hsl(${t.token})` : `hsl(${t.token} / ${t.alpha})`;
}

/**
 * Faint background tint for a status badge.
 *
 * Callers used to build this by appending the hex alpha `1A` to
 * `getStatusColor(...)`. That worked while the palette was hex, but the
 * monochrome refactor made these `hsl(var(--x))`, and `hsl(var(--x))1A` is
 * invalid: `var()` defers validation to computed-value time, where the trailing
 * garbage makes the whole declaration drop. Verified in Chromium — it computes
 * to `rgba(0, 0, 0, 0)`, so the tint silently disappeared everywhere.
 */
export function getStatusTint(status: string | undefined): string {
  const t = statusToken(status);
  return t ? `hsl(${t.token} / 0.1)` : 'transparent';
}

/** Same fix for a content type's own colour, which is also `hsl(var(--x))`. */
export function tintOf(color: string | undefined): string {
  if (!color) return 'transparent';
  const m = /^hsl\(\s*(.+?)\s*\)$/.exec(color.trim());
  if (!m) return 'transparent';
  // Drop any existing alpha before adding ours.
  return `hsl(${m[1].split('/')[0].trim()} / 0.1)`;
}

export function getStatusLabel(status: string | undefined): string {
  if (!status) return '';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
