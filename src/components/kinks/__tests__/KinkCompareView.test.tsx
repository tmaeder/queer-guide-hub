import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useKinkCompare = vi.fn();
const useKinkCompareSummary = vi.fn();
const useKinkTaxonomy = vi.fn();

vi.mock('@/hooks/useKinkCompare', () => ({
  useKinkCompare: (...a: unknown[]) => useKinkCompare(...a),
  useKinkCompareSummary: (...a: unknown[]) => useKinkCompareSummary(...a),
}));
vi.mock('@/hooks/useKinkTaxonomy', () => ({
  useKinkTaxonomy: (...a: unknown[]) => useKinkTaxonomy(...a),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' }, t: (k: string, d?: string) => d ?? k }),
}));

import { KinkCompareView } from '../KinkCompareView';

const taxonomy = {
  categories: [
    {
      id: 'c1',
      slug: 'oral-hands',
      label: 'Oral & hands',
      label_i18n: {},
      description: null,
      description_i18n: {},
      axis: 'give_receive',
      sort_order: 1,
    },
  ],
  items: [
    {
      id: 'i1',
      category_id: 'c1',
      slug: 'oral-sex',
      label: 'Oral sex',
      label_i18n: {},
      description: null,
      description_i18n: {},
      axis_override: null,
      discussion_recommended: false,
      sort_order: 1,
    },
    {
      id: 'i2',
      category_id: 'c1',
      slug: 'deep-throating',
      label: 'Deep throating',
      label_i18n: {},
      description: null,
      description_i18n: {},
      axis_override: null,
      discussion_recommended: true,
      sort_order: 2,
    },
  ],
  itemsByCategory: new Map(),
};

describe('KinkCompareView', () => {
  beforeEach(() => {
    useKinkCompare.mockReset();
    useKinkCompareSummary.mockReset();
    useKinkTaxonomy.mockReturnValue({ data: taxonomy });
    useKinkCompareSummary.mockReturnValue({ data: null });
  });

  it('shows an honest empty state when there is no overlap', () => {
    useKinkCompare.mockReturnValue({ data: [], isLoading: false });
    render(<KinkCompareView otherId="u2" />);
    expect(screen.getByText(/No overlapping interests visible yet/i)).toBeInTheDocument();
  });

  it('renders overlaps with side notes and both-favorite marker', () => {
    useKinkCompare.mockReturnValue({
      data: [
        {
          category_slug: 'oral-hands',
          item_slug: 'oral-sex',
          my_side: 'giving',
          my_rating: 'favorite',
          their_side: 'receiving',
          their_rating: 'favorite',
          kind: 'overlap',
        },
      ],
      isLoading: false,
    });
    useKinkCompareSummary.mockReturnValue({
      data: { overlaps: 1, favorites_both: 1, discuss: 0, excluded_count: 2 },
    });
    render(<KinkCompareView otherId="u2" />);
    expect(screen.getByText('Oral sex')).toBeInTheDocument();
    expect(screen.getByText(/You: giving · Them: receiving/i)).toBeInTheDocument();
    expect(screen.getByText(/1 both favorite/i)).toBeInTheDocument();
    // Vetoed items are a count, never named.
    expect(screen.getByText(/2 left out, boundaries respected/i)).toBeInTheDocument();
  });

  it('surfaces discuss overlaps as opening-line prompts', () => {
    const onOpeningLine = vi.fn();
    useKinkCompare.mockReturnValue({
      data: [
        {
          category_slug: 'oral-hands',
          item_slug: 'deep-throating',
          my_side: 'giving',
          my_rating: 'curious',
          their_side: 'receiving',
          their_rating: 'like',
          kind: 'discuss',
        },
      ],
      isLoading: false,
    });
    render(<KinkCompareView otherId="u2" otherName="Sam" onOpeningLine={onOpeningLine} />);
    expect(screen.getByText(/Talk about these first/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ask about Deep throating/i }));
    expect(onOpeningLine).toHaveBeenCalledWith(expect.stringContaining('Deep throating'));
    expect(onOpeningLine).toHaveBeenCalledWith(expect.stringContaining('Sam'));
  });
});
