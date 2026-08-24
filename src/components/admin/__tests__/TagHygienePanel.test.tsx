import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { TagHygienePanel } from '../TagHygienePanel';
import { HYGIENE_METRICS } from '@/lib/tagHygieneMetrics';

const mockUseTagHygieneStats = vi.fn();
vi.mock('@/hooks/useTagHygieneStats', () => ({
  useTagHygieneStats: () => mockUseTagHygieneStats(),
}));

const STATS = {
  totals: { active_tags: 9546, categories: 41, assignments: 172_003 },
  uncategorized_active: 14,
  dangling_category_id: 0,
  image_without_license: 1217,
  commons_image_without_license: 0,
  image_alt_column_empty: 1217,
  assignment_to_non_active_tag: 0,
  nonclean_entity_type: 0,
  duplicate_active_name: 14,
  redirect_to_non_canonical: 58,
  merged_but_not_status_merged: 1,
  sensitive_without_description: 19,
  indexable_without_description: 0,
  event_tag_strings_unresolved: 363,
  events_with_tags_unlinked: 35_131,
};

describe('TagHygienePanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders every counter the hook returns', () => {
    mockUseTagHygieneStats.mockReturnValue({ data: STATS, error: null, isLoading: false });
    renderWithProviders(<TagHygienePanel />);

    for (const m of HYGIENE_METRICS) {
      expect(screen.getByText(m.label), `${m.key} not rendered`).toBeInTheDocument();
    }
    // The advisory gauges are the reason this panel exists — CI only warns on
    // them, so a run log is not a surface.
    expect(screen.getByText('35131')).toBeInTheDocument();
  });

  it('shows the failure instead of an empty card when the RPC errors', () => {
    // `tag_hygiene_stats()` reads the whole events corpus and has sat on
    // PostgREST's 8s statement_timeout before. Returning null here would
    // reproduce the exact silence this panel was built to end.
    mockUseTagHygieneStats.mockReturnValue({
      data: undefined,
      error: new Error('canceling statement due to statement timeout'),
      isLoading: false,
    });
    renderWithProviders(<TagHygienePanel />);

    expect(screen.getByText(/tag_hygiene_stats\(\) failed/)).toBeInTheDocument();
    expect(screen.getByText(/statement timeout/)).toBeInTheDocument();
  });

  it('renders nothing while loading', () => {
    mockUseTagHygieneStats.mockReturnValue({ data: undefined, error: null, isLoading: true });
    const { container } = renderWithProviders(<TagHygienePanel />);
    expect(container).toBeEmptyDOMElement();
  });
});
