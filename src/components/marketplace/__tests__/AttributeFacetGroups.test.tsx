import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttributeFacetGroups } from '../AttributeFacetGroups';
import type { MarketplaceTagFacet } from '@/hooks/useMarketplaceQueries';

const f = (
  slug: string,
  name: string,
  kind: MarketplaceTagFacet['kind'],
  count: number,
): MarketplaceTagFacet => ({ slug, name, kind, count });

/** The live apparel shape: count-sorted, kinds interleaved. */
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

describe('AttributeFacetGroups', () => {
  it('renders ONE trigger per kind, in the department order', () => {
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={APPAREL}
        selected={[]}
        onToggle={vi.fn()}
      />,
    );
    // The whole point of the dropdowns: six kinds cost six triggers on one
    // row, not six stacked rows of chips.
    const triggers = screen.getAllByRole('button').map((b) => b.textContent);
    expect(triggers).toEqual(['Size', 'Color', 'Material', 'Vibe']);
  });

  it('keeps every option reachable — no expander, nothing hidden', async () => {
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={APPAREL}
        selected={[]}
        onToggle={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /filter by color/i }));
    // 11 colours, all present. The old inline version hid 5 behind "+5"; a
    // scrolling popover costs the page no height, so nothing needs hiding.
    for (const n of ['Black', 'C0', 'C9']) {
      expect(screen.getByText(n)).toBeInTheDocument();
    }
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it('orders sizes by the ladder, never by count', async () => {
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={APPAREL}
        selected={[]}
        onToggle={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /filter by size/i }));
    const opts = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((t) => /^(XXS|XS|S|M|L|XL|\dXL)\d/.test(t))
      .map((t) => t.replace(/[\d,]+$/, ''));
    // Count order would be S, XL, XS, 5XL — the ordering a reader reads as broken.
    expect(opts).toEqual(['XS', 'S', 'XL', '5XL']);
  });

  it('shows how many filters a collapsed kind is holding', () => {
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={APPAREL}
        selected={['color-black', 'color-c9']}
        onToggle={vi.fn()}
      />,
    );
    // A dropdown hides its applied state, so the count on the trigger is the
    // only thing telling a reader the grid is filtered. Without it the result
    // count moves with nothing on screen explaining why.
    const trigger = screen.getByRole('button', { name: /filter by color/i });
    expect(trigger).toHaveTextContent('Color · 2');
    expect(trigger).toHaveAttribute('aria-pressed', 'true');
    // An untouched kind must NOT claim to be filtering.
    expect(screen.getByRole('button', { name: /filter by size/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('marks the selected options inside the dropdown', async () => {
    render(
      <AttributeFacetGroups
        department="apparel"
        facets={APPAREL}
        selected={['color-c9']}
        onToggle={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /filter by color/i }));
    const row = screen.getByText('C9').closest('button');
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Black').closest('button')).toHaveAttribute('aria-pressed', 'false');
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
    expect(screen.getByRole('button', { name: /filter by genre/i })).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: /filter by material/i }));
    await userEvent.click(screen.getByText('Cotton'));
    expect(onToggle).toHaveBeenCalledWith('mat-cotton');
  });
});
