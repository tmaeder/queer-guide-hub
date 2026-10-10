import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttributeFacetGroups } from '../AttributeFacetGroups';
import type { MarketplaceTagFacet } from '@/hooks/useMarketplaceQueries';

const f = (
  slug: string,
  name: string,
  kind: MarketplaceTagFacet['kind'],
  count: number,
): MarketplaceTagFacet => ({ slug, name, kind, count });

/** Mirrors COLLAPSE_AT in the component. Deliberately restated rather than
 *  exported: if someone changes the threshold, these assertions SHOULD fail
 *  loudly and be re-read, not silently follow it. */
const COLLAPSE_AT = 6;

/** The live apparel shape: count-sorted, kinds interleaved, 11 colours so the
 *  collapse threshold is crossed in exactly one group (size has 4, under it). */
const APPAREL: MarketplaceTagFacet[] = [
  f('size-s', 'S', 'size', 2660),
  f('size-xl', 'XL', 'size', 2585),
  f('size-xs', 'XS', 'size', 1450),
  f('size-5xl', '5XL', 'size', 1208),
  f('color-black', 'Black', 'color', 1189),
  ...Array.from({ length: 10 }, (_, i) => f(`color-c${i}`, `C${i}`, 'color', 1000 - i)),
  f('mat-cotton', 'Cotton', 'material', 190),
  f('vibe-bold', 'Bold', 'vibe', 158),
];

const groupChips = (kind: string) => {
  const label = screen.getByText(kind);
  const row = label.parentElement as HTMLElement;
  return within(row)
    .getAllByRole('button')
    .map((b) => b.textContent ?? '');
};

describe('AttributeFacetGroups', () => {
  it('splits one flat wall into labelled groups in the department order', () => {
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={APPAREL}
        selected={[]}
        onToggle={vi.fn()}
      />,
    );
    // attributeFacetsForDepartment('apparel') leads with size, then colour.
    const labels = screen.getAllByText(/^(Size|Color|Material|Vibe)$/).map((n) => n.textContent);
    expect(labels).toEqual(['Size', 'Color', 'Material', 'Vibe']);
  });

  it('orders sizes by the ladder, never by count', () => {
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={APPAREL}
        selected={[]}
        onToggle={vi.fn()}
      />,
    );
    // Count order would be S, XL, XS, 5XL — the ordering a reader reads as broken.
    expect(groupChips('Size').map((t) => t.split(' ')[0])).toEqual(['XS', 'S', 'XL', '5XL']);
  });

  it('collapses a long group behind an expander and reveals the rest on click', async () => {
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={APPAREL}
        selected={[]}
        onToggle={vi.fn()}
      />,
    );
    // 11 colours at threshold 6 → 6 chips + one "+5". Asserting the COUNT
    // alone is not enough (chips + expander is a count either way); the
    // hidden colour BY NAME is what separates collapsed from expanded.
    expect(groupChips('Color')).toHaveLength(COLLAPSE_AT + 1);
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.queryByText(/^C9/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('+5'));
    expect(screen.queryByText('+5')).not.toBeInTheDocument();
    expect(screen.getByText(/^C9/)).toBeInTheDocument();
    expect(groupChips('Color')).toHaveLength(11);
  });

  it('keeps a SELECTED chip visible even when its rank is past the cut', () => {
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={APPAREL}
        selected={['color-c9']}
        onToggle={vi.fn()}
      />,
    );
    // c9 ranks 11th, well past the cut of 6. Hiding an applied filter moves
    // the result count with nothing on screen explaining why.
    const chip = screen.getByText(/^C9/).closest('button');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    // The expander must EXCLUDE the surfaced chip, or it over-reports what is
    // still hidden: 11 colours, 6 by rank + 1 surfaced = 4 left, not 5.
    expect(screen.getByText('+4')).toBeInTheDocument();
  });

  it('renders a kind the department order does not list rather than dropping it', () => {
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={[f('genre-poetry', 'Poetry', 'genre', 4)]}
        selected={[]}
        onToggle={vi.fn()}
      />,
    );
    // 'genre' is absent from ATTRIBUTE_FACETS_BY_DEPARTMENT.apparel — a
    // vocabulary gap must not silently delete a working filter.
    expect(screen.getByText('Genre')).toBeInTheDocument();
    expect(screen.getByText(/^Poetry/)).toBeInTheDocument();
  });

  it('toggles by slug', async () => {
    const onToggle = vi.fn();
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={APPAREL}
        selected={[]}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByText(/^Cotton/));
    expect(onToggle).toHaveBeenCalledWith('mat-cotton');
  });
});
