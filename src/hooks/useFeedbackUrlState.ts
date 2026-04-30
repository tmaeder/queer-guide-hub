import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export interface FeedbackFiltersState {
  q: string;
  category: string | null;
  status: string | null;
  priority: number | null;
  assignee: string | null;
  label: string | null;
  hasScreenshot: boolean;
  hasErrors: boolean;
  withClaude: boolean;
}

export interface FeedbackUrlState extends FeedbackFiltersState {
  tab: 'stories' | 'spam' | 'analytics';
  sel: string | null;
  story: string | null;
  showSpam: boolean;
  showDuplicates: boolean;
  archived: boolean;
}

const defaults: FeedbackUrlState = {
  tab: 'stories',
  q: '',
  category: null,
  status: null,
  priority: null,
  assignee: null,
  label: null,
  hasScreenshot: false,
  hasErrors: false,
  withClaude: false,
  sel: null,
  story: null,
  showSpam: false,
  showDuplicates: false,
  archived: false,
};

function parseNum(v: string | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Deep-link all board state through URL search params. Opening a shared link
 * restores search / filters / selected tab / open drawer id.
 */
export function useFeedbackUrlState() {
  const [params, setParams] = useSearchParams();

  const state = useMemo<FeedbackUrlState>(() => {
    const tab = params.get('tab');
    const parsedTab: FeedbackUrlState['tab'] =
      tab === 'spam' ? 'spam' : tab === 'analytics' ? 'analytics' : 'stories';
    return {
      tab: parsedTab,
      q: params.get('q') ?? '',
      category: params.get('category'),
      status: params.get('status'),
      priority: parseNum(params.get('priority')),
      assignee: params.get('assignee'),
      label: params.get('label'),
      hasScreenshot: params.get('hasScreenshot') === '1',
      hasErrors: params.get('hasErrors') === '1',
      withClaude: params.get('withClaude') === '1',
      sel: params.get('sel'),
      story: params.get('story'),
      showSpam: params.get('showSpam') === '1',
      showDuplicates: params.get('showDuplicates') === '1',
      archived: params.get('archived') === '1',
    };
  }, [params]);

  const update = useCallback(
    (patch: Partial<FeedbackUrlState>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (
              v == null ||
              v === '' ||
              v === false ||
              (k === 'tab' && v === defaults.tab)
            ) {
              next.delete(k);
            } else if (typeof v === 'boolean') {
              next.set(k, '1');
            } else {
              next.set(k, String(v));
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        [
          'q',
          'category',
          'status',
          'priority',
          'assignee',
          'label',
          'hasScreenshot',
          'hasErrors',
          'withClaude',
        ].forEach((k) => next.delete(k));
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (state.q) n++;
    if (state.category) n++;
    if (state.status) n++;
    if (state.priority != null) n++;
    if (state.assignee) n++;
    if (state.label) n++;
    if (state.hasScreenshot) n++;
    if (state.hasErrors) n++;
    if (state.withClaude) n++;
    return n;
  }, [state]);

  return { state, update, clearFilters, activeFilterCount };
}
