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

export interface PersistedState {
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

export function persistState(
  key: string,
  state: {
    sortField: SortField;
    sortDir: SortDir;
    filters: FilterState;
    hiddenColumns: string[];
  },
) {
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

export function getStatusColor(status: string | undefined): string {
  if (!status) return 'transparent';
  const s = status.toLowerCase();
  if (['published', 'active', 'public', 'verified'].includes(s)) return '#10b981';
  if (['draft', 'pending'].includes(s)) return '#9ca3af';
  if (['review', 'restricted'].includes(s)) return '#f59e0b';
  if (['archived', 'expired', 'sold', 'completed', 'rejected'].includes(s)) return '#6b7280';
  if (['cancelled'].includes(s)) return '#ef4444';
  return '#9ca3af';
}

export function getStatusLabel(status: string | undefined): string {
  if (!status) return '';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
