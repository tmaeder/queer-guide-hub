/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QualityCohortBar } from '../QualityCohortBar';
import { cohortLabel, isLowConfidence } from '@/lib/qualityQueue';
import type { ReviewQueueCohort } from '@/hooks/useReviewQueueCohorts';

function cohort(over: Partial<ReviewQueueCohort> = {}): ReviewQueueCohort {
  return {
    entity_type: 'venue',
    field: 'accessibility_attributes',
    queue_key: 'quality-venue',
    n: 749,
    decidable: 749,
    risk_gated: 0,
    batchable: false,
    avg_confidence: 0.88,
    oldest_at: '2026-06-08T00:00:00Z',
    ...over,
  };
}

const filters = {
  queueTypes: null,
  contentTypes: null,
  search: '',
  sort: 'priority' as const,
  page: 1,
  perPage: 50,
};

describe('cohortLabel', () => {
  it('reads a social_links field as a platform link', () => {
    expect(cohortLabel('social_links.xvideos')).toBe('Xvideos link');
  });
  it('humanises an ordinary field', () => {
    expect(cohortLabel('accessibility_attributes')).toBe('Accessibility attributes');
  });
});

describe('isLowConfidence', () => {
  it('marks the adult-link cohorts, which average 0.60', () => {
    expect(isLowConfidence(cohort({ avg_confidence: 0.6 }))).toBe(true);
  });
  it('leaves accessibility alone at 0.88', () => {
    expect(isLowConfidence(cohort({ avg_confidence: 0.88 }))).toBe(false);
  });
  it('treats an unscored cohort as not low — a null is absence, not a low score', () => {
    expect(isLowConfidence(cohort({ avg_confidence: null }))).toBe(false);
  });
});

describe('QualityCohortBar', () => {
  it('renders nothing when there are no cohorts', () => {
    const { container } = render(
      <QualityCohortBar
        cohorts={[]}
        isLoading={false}
        filters={filters}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each cohort with its count', () => {
    render(
      <QualityCohortBar
        cohorts={[cohort(), cohort({ field: 'safety_notes', entity_type: 'city', n: 692 })]}
        isLoading={false}
        filters={filters}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Accessibility attributes')).toBeInTheDocument();
    expect(screen.getByText('749')).toBeInTheDocument();
    expect(screen.getByText('Safety notes')).toBeInTheDocument();
    expect(screen.getByText('692')).toBeInTheDocument();
  });

  /**
   * The load-bearing one. `editorial_hook` is an open cohort on BOTH cities and
   * villages, so pinning the field alone would show a pile that is two
   * campaigns mixed together — the exact thing this bar exists to undo.
   */
  it('pins the queue key as well as the field when selected', () => {
    const onFiltersChange = vi.fn();
    render(
      <QualityCohortBar
        cohorts={[
          cohort({ field: 'editorial_hook', entity_type: 'city', queue_key: 'quality-city' }),
        ]}
        isLoading={false}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />,
    );
    fireEvent.click(screen.getByText('Editorial hook'));
    expect(onFiltersChange).toHaveBeenCalledWith({
      search: 'editorial_hook',
      queueTypes: ['quality-city'],
      page: 1,
    });
  });

  it('clears back to the whole queue when the active cohort is clicked again', () => {
    const onFiltersChange = vi.fn();
    render(
      <QualityCohortBar
        cohorts={[cohort()]}
        isLoading={false}
        filters={{
          ...filters,
          search: 'accessibility_attributes',
          queueTypes: ['quality-venue'],
        }}
        onFiltersChange={onFiltersChange}
      />,
    );
    fireEvent.click(screen.getByText('Accessibility attributes'));
    expect(onFiltersChange).toHaveBeenCalledWith({ search: '', queueTypes: null, page: 1 });
  });

  it('marks the active cohort for assistive tech, not by colour alone', () => {
    render(
      <QualityCohortBar
        cohorts={[cohort()]}
        isLoading={false}
        filters={{ ...filters, search: 'accessibility_attributes', queueTypes: ['quality-venue'] }}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument();
  });

  /**
   * 346 of the 692 open city safety notes cannot be approved without an
   * explicit confirmation. A reviewer choosing what to work on needs that
   * before they open the pile, not after.
   */
  it('surfaces the risk-gated count with a text alternative', () => {
    render(
      <QualityCohortBar
        cohorts={[cohort({ field: 'safety_notes', entity_type: 'city', n: 692, risk_gated: 346 })]}
        isLoading={false}
        filters={filters}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByText('346')).toBeInTheDocument();
    expect(
      screen.getByText('346 rows need a safety confirmation before approval'),
    ).toBeInTheDocument();
  });

  /**
   * WCAG 2.5.8. axe failed the sibling row checkbox on this route at 16px
   * (`target-size`, serious), so the gate is live here.
   *
   * What earns the 24px is `rounded-badge`: index.css gives
   * `button.rounded-badge` a `min-height: 24px` in @layer base, the documented
   * opt-down from the 44px every <button> otherwise inherits there. So the
   * assertion pins that class, not a per-chip `min-h-*` — the first draft of
   * this test added `min-h-6` and asserted it, which was redundant with the
   * base rule and described the size as coming from the element's own padding.
   * `min-h-0` is asserted absent because it is the documented escape hatch from
   * the same rule and would silently drop the chip under the bar.
   */
  it('gives every cohort chip a 24px target', () => {
    render(
      <QualityCohortBar
        cohorts={[cohort(), cohort({ field: 'safety_notes', entity_type: 'city' })]}
        isLoading={false}
        filters={filters}
        onFiltersChange={vi.fn()}
      />,
    );
    const chips = screen.getAllByRole('button');
    expect(chips.length).toBe(2);
    for (const chip of chips) {
      expect(chip.className).toContain('rounded-badge');
      expect(chip.className).not.toMatch(/\bmin-h-0\b/);
      expect(chip.className).not.toMatch(/\bh-4\b/);
    }
  });

  it('does not mark a cohort with no gated rows', () => {
    render(
      <QualityCohortBar
        cohorts={[cohort({ risk_gated: 0 })]}
        isLoading={false}
        filters={filters}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/need a safety confirmation/)).not.toBeInTheDocument();
  });
});
