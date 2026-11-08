import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { ICON_DEFS, ink } from '@/components/transit/iconDefs';
import { TRANSIT_ICON_NAMES, TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';

describe('TransitIcon', () => {
  it('serialises standalone map artwork with explicit ink and the requested size', () => {
    const svg = renderToStaticMarkup(<TransitIcon name="search" size={20} color={ink} />);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="20"');
    expect(svg).toContain(`stroke="${ink}"`);
    expect(svg).not.toContain('currentColor');
  });

  it('draws every map glyph as a single outline using the shared geometry', () => {
    expect(TRANSIT_ICON_NAMES).toHaveLength(274);
    for (const name of TRANSIT_ICON_NAMES) {
      const { container, unmount } = render(<TransitIcon name={name} color={ink} />);
      const paths = container.querySelectorAll('path');
      expect(paths, name).toHaveLength(1);
      expect(paths[0].getAttribute('d'), name).toBe(TRANSIT_ICON_PATHS[name]);
      expect(paths[0].getAttribute('d'), name).toBeTruthy();
      expect(paths[0].getAttribute('fill'), name).toBe('none');
      expect(paths[0].getAttribute('stroke'), name).toBe(ink);
      unmount();
    }
  });

  it('uses the same simple outline at UI and illustration sizes', () => {
    for (const size of [16, 24, 32, 64]) {
      const { container, unmount } = render(<TransitIcon name="rainbow" size={size} />);
      expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 100 100');
      const paths = container.querySelectorAll('path');
      expect(paths).toHaveLength(1);
      expect(paths[0]).toHaveAttribute('d', TRANSIT_ICON_PATHS.rainbow);
      expect(paths[0]).toHaveAttribute('fill', 'none');
      expect(paths[0]).toHaveAttribute('stroke', 'currentColor');
      expect(paths[0]).toHaveAttribute('stroke-width', '7.5');
      unmount();
    }
  });

  it('retains a filled selected state and a matching hollow outline', () => {
    const { container, rerender } = render(<TransitIcon name="saved" hollow />);
    const path = container.querySelector('path');
    expect(path).toHaveAttribute('fill', 'none');
    expect(path).toHaveAttribute('d', TRANSIT_ICON_PATHS.saved);
    rerender(<TransitIcon name="saved" />);
    expect(path).toHaveAttribute('fill', ICON_DEFS.saved.hex);
    expect(path).toHaveAttribute('d', TRANSIT_ICON_PATHS.saved);
  });

  it('keeps the four colors in the Pride flag', () => {
    const { container } = render(<TransitIcon name="pride" />);
    const bands = [...container.querySelectorAll('path')].slice(1);
    expect(bands.map((band) => band.getAttribute('fill'))).toEqual(['#FF1F8F', '#00B4E6', '#2BE05A', '#FFD500']);
  });

  it('is aria-hidden by default, labelled when told', () => {
    const { container } = render(<TransitIcon name="search" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    render(<TransitIcon name="search" label="Search" />);
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });
});
