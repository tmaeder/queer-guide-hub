import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { ICON_DEFS, ink } from '@/components/transit/iconDefs';
import {
  TRANSIT_ICON_NAMES,
  TRANSIT_ICON_PATHS,
} from '@/components/transit/transitIconPaths';

describe('TransitIcon', () => {
  // The map rasterizes these into MapLibre images by serialising them on their
  // own and loading the result as a data-URI. A standalone SVG document
  // without an explicit namespace does not decode, and `mapGlyphs` fails soft
  // — so a missing xmlns costs every pin its category glyph with no error
  // anywhere. Assert the two things that serialisation depends on.
  it('serialises to a standalone SVG document the browser can decode', () => {
    const svg = renderToStaticMarkup(<TransitIcon name="search" size={20} color="#111111" />);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // The colour must land on the elements themselves: there is no ancestor
    // for `currentColor` to inherit from once the markup is on its own.
    expect(svg).toContain('stroke="#111111"');
    expect(svg).not.toContain('currentColor');
  });

  describe('monochrome mode (`color`)', () => {
    // The map draws an INK glyph inside a pin that is already the layer's track
    // colour — ink-on-track is a measured contrast fix — and the favicon is one
    // file serving a 16px tab and a 512px app icon. Both need the v1 rendition:
    // one hollow path, one weight, the full 0-100 box.
    it('draws one hollow path per icon, in the given colour', () => {
      for (const name of TRANSIT_ICON_NAMES) {
        const { container, unmount } = render(<TransitIcon name={name} color={ink} />);
        const paths = container.querySelectorAll('path');
        expect(paths, name).toHaveLength(1);
        expect(paths[0].getAttribute('fill'), name).toBe('none');
        expect(paths[0].getAttribute('stroke'), name).toBe(ink);
        unmount();
      }
    });

    it('keeps the full 0-100 box and draws no ticks', () => {
      // Reserving the 8-unit tick margin here would shrink the glyph 14% in the
      // two places with the least room for it, and neither draws ticks anyway.
      const svg = renderToStaticMarkup(<TransitIcon name="events" size={64} color={ink} />);
      expect(svg).toContain('viewBox="0 0 100 100"');
      expect(svg.match(/<path/g)).toHaveLength(1);
    });

    it('emits each path exactly once, so a tinted glyph is not double-stroked', () => {
      // A line drawing stores the same `d` twice — ink under, colour over. The
      // monochrome path is deduplicated; without that it would stroke at 2.2x
      // and 1.1x on top of each other and come out visibly fatter than the
      // rest of the set.
      const d = TRANSIT_ICON_PATHS.rainbow;
      const first = ICON_DEFS.rainbow.l![0];
      const geometry = typeof first === 'string' ? first : first[0];
      expect(d).toBe(geometry);
    });
  });

  describe('colour mode (default)', () => {
    it('gives every filled shape an ink outline and a track fill', () => {
      // §4b: the outline is always ink, colour sits inside it. A coloured
      // outline would put the colour where the ink belongs.
      for (const name of TRANSIT_ICON_NAMES) {
        const def = ICON_DEFS[name];
        if (!def.f?.length) continue;
        const { container, unmount } = render(<TransitIcon name={name} />);
        const filled = [...container.querySelectorAll('path')].slice(0, def.f.length);
        for (const p of filled) {
          expect(p.getAttribute('stroke'), name).toBe(ink);
          expect(p.getAttribute('fill'), name).not.toBe('none');
        }
        unmount();
      }
    });

    it('draws into the plain 100-unit box at every size, like monochrome', () => {
      // The tick margin is INSIDE 0-100 (§3 reserves 0-12 and 88-100), so an
      // outer bleed would reserve it twice and render every icon at 86% of the
      // size the `size` prop promises — which is what made the set look small
      // and thin. One box, both modes, no rescale across the 32px tick
      // threshold.
      for (const size of [16, 24, 32, 64]) {
        const svg = renderToStaticMarkup(<TransitIcon name="saved" size={size} />);
        expect(svg, `${size}px`).toContain('viewBox="0 0 100 100"');
      }
    });

    it('can be told to draw no ticks even when it is large enough', () => {
      // A glyph set inside another shape (the marketplace station disc) has
      // that shape as its boundary, so its tick margin is interior.
      const plain = renderToStaticMarkup(<TransitIcon name="saved" size={64} />);
      const quiet = renderToStaticMarkup(<TransitIcon name="saved" size={64} ticks={false} />);
      expect((plain.match(/<path/g) ?? []).length - (quiet.match(/<path/g) ?? []).length).toBe(3);
    });

    it('drops motion ticks below 32px and draws them at and above it', () => {
      const count = (size: number) =>
        (renderToStaticMarkup(<TransitIcon name="saved" size={size} />).match(/<path/g) ?? [])
          .length;
      // `saved` is a single heart with a `crown` tick set, so the difference
      // between the two is exactly the three ticks.
      expect(count(32) - count(24)).toBe(3);
    });

    it('draws no ticks for an icon whose set is `none`', () => {
      const quiet = renderToStaticMarkup(<TransitIcon name="aftercare" size={64} />);
      const loud = renderToStaticMarkup(<TransitIcon name="saved" size={64} />);
      // Both are a heart plus strokes; only one is allowed to be jaunty.
      expect(quiet.match(/<path/g)).toHaveLength(2);
      expect((loud.match(/<path/g) ?? []).length).toBeGreaterThan(2);
    });
  });

  // Exact count on purpose — it is the guard against a vacuous "every icon
  // renders" pass over an accidentally-empty set.
  it('has 76 icons and bumps stroke weight below 32px', () => {
    expect(TRANSIT_ICON_NAMES).toHaveLength(76);
    const w = (size: number) =>
      Number(
        render(<TransitIcon name="search" size={size} color={ink} />)
          .container.querySelector('path')!
          .getAttribute('stroke-width'),
      );
    // 9 / 11 / 13 — see the ramp comment in TransitIcon. A v2 mark is an
    // outline around a fill, so it needs more weight at small sizes than v1's
    // single stroke did.
    expect(w(20)).toBe(13);
    expect(w(24)).toBe(11);
    expect(w(48)).toBe(9);
  });

  it('is aria-hidden by default, labelled when told', () => {
    const { container } = render(<TransitIcon name="search" />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    render(<TransitIcon name="search" label="Search" />);
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });
});
