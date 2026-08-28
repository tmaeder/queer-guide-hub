import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const mockRows = vi.fn();
vi.mock('@/hooks/useTagRelationships', () => ({
  useSubstanceInteractions: () => ({ data: mockRows(), isLoading: false }),
}));

const { SubstanceInteractions } = await import('../SubstanceInteractions');

const row = (over: Record<string, unknown> = {}) => ({
  other_id: 'a',
  other_slug: 'ghb',
  other_name: 'GHB',
  status: 'dangerous',
  severity: 0,
  note: null,
  source: 'tripsit',
  source_url: 'https://tripsit.me/combos',
  ...over,
});

describe('SubstanceInteractions attribution', () => {
  it('credits TripSit by its display name, not the lowercase source key', () => {
    mockRows.mockReturnValue([row()]);
    renderWithProviders(<SubstanceInteractions tagId="t1" tagName="Alcohol" />);
    const link = screen.getByRole('link', { name: 'TripSit' });
    expect(link).toHaveAttribute('href', 'https://tripsit.me/combos');
  });

  // The regression this guards. Attribution used to be `rows[0]` printed under a
  // hardcoded "TripSit" label. Rows sort worst-first, so once the poppers/PDE5
  // combinations were added from the FDA labels, the FIRST row on /tags/poppers
  // is an FDA row — and the page would have credited TripSit for an FDA label,
  // linking to dailymed. A false provenance claim on a safety surface.
  it('credits each distinct source, and never attributes an FDA label to TripSit', () => {
    mockRows.mockReturnValue([
      row({
        other_slug: 'viagra',
        other_name: 'Viagra',
        source: 'FDA label',
        source_url: 'https://dailymed.nlm.nih.gov/x',
      }),
      row({ status: 'caution' }),
    ]);
    renderWithProviders(<SubstanceInteractions tagId="t1" tagName="Poppers" />);

    const fda = screen.getByRole('link', { name: 'FDA label' });
    expect(fda).toHaveAttribute('href', 'https://dailymed.nlm.nih.gov/x');
    expect(screen.getByRole('link', { name: 'TripSit' })).toHaveAttribute(
      'href',
      'https://tripsit.me/combos',
    );
  });

  it('deduplicates a source shared by several rows', () => {
    mockRows.mockReturnValue([row(), row({ other_slug: 'ketamine', status: 'unsafe' })]);
    renderWithProviders(<SubstanceInteractions tagId="t1" tagName="Alcohol" />);
    expect(screen.getAllByRole('link', { name: 'TripSit' })).toHaveLength(1);
  });

  it('renders nothing when the term has no interaction rows', () => {
    mockRows.mockReturnValue([]);
    const { container } = renderWithProviders(
      <SubstanceInteractions tagId="t1" tagName="Bear Bar" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
