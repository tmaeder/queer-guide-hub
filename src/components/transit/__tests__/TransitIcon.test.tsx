import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { TRANSIT_ICON_NAMES } from '@/components/transit/transitIconPaths';

describe('TransitIcon', () => {
  // The map rasterizes these into MapLibre images by serialising them on their
  // own and loading the result as a data-URI. A standalone SVG document
  // without an explicit namespace does not decode, and `mapGlyphs` fails soft
  // — so a missing xmlns costs every pin its category glyph with no error
  // anywhere. Assert the two things that serialisation depends on.
  it('serialises to a standalone SVG document the browser can decode', () => {
    const svg = renderToStaticMarkup(<TransitIcon name="search" size={20} color="#111111" />);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // `color` must land on the element itself: there is no ancestor to
    // inherit `currentColor` from once the markup is on its own.
    expect(svg).toMatch(/style="[^"]*color:/);
  });

  it('renders a stroke-only svg for every name', () => {
    for (const name of TRANSIT_ICON_NAMES) {
      const { container, unmount } = render(<TransitIcon name={name} />);
      const path = container.querySelector('path');
      expect(path, name).not.toBeNull();
      expect(path!.getAttribute('fill')).toBe('none');
      expect(path!.getAttribute('stroke')).toBe('currentColor');
      unmount();
    }
  });

  // Exact count on purpose — it is the guard against a vacuous "every icon
  // renders" pass over an accidentally-empty set. 42 wayfinding icons from the
  // rebrand + 10 venue-category glyphs added 2026-08-10 so the map could drop
  // lucide from its pins + 7 marketplace department glyphs added 2026-08-23 so
  // the department tiles could stop using a product photograph as category art.
  it('has 59 icons and bumps stroke weight below 32px', () => {
    expect(TRANSIT_ICON_NAMES).toHaveLength(59);
    const { container } = render(<TransitIcon name="search" size={24} />);
    expect(container.querySelector('path')!.getAttribute('stroke-width')).toBe('10');
    const { container: big } = render(<TransitIcon name="search" size={48} />);
    expect(big.querySelector('path')!.getAttribute('stroke-width')).toBe('9');
  });

  it('is aria-hidden by default, labelled when told', () => {
    const { container } = render(<TransitIcon name="search" />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    render(<TransitIcon name="search" label="Search" />);
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });
});
