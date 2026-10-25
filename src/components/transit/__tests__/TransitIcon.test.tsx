import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { ICON_DEFS, ink } from '@/components/transit/iconDefs';
import { TRANSIT_ICON_NAMES, TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';

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
    it('outlines every filled shape in ink, or in nothing at all', () => {
      // §4b: colour sits INSIDE an outline and may never act as one. An
      // outline weight of 0 is the only way a fill goes without — and it has
      // to mean NO stroke, not a stroke of the track colour, which is the one
      // way this escape hatch could break the rule it sits beside.
      let unoutlined = 0;
      for (const name of TRANSIT_ICON_NAMES) {
        const def = ICON_DEFS[name];
        if (!def.f?.length) continue;
        const { container, unmount } = render(<TransitIcon name={name} />);
        const filled = [...container.querySelectorAll('path')].slice(0, def.f.length);
        filled.forEach((p, i) => {
          const [, , outline = 1] = def.f![i];
          if (outline === 0) {
            unoutlined += 1;
            expect(p.getAttribute('stroke'), `${name} f[${i}]`).toBe('none');
          } else {
            expect(p.getAttribute('stroke'), `${name} f[${i}]`).toBe(ink);
          }
          expect(p.getAttribute('fill'), `${name} f[${i}]`).not.toBe('none');
        });
        unmount();
      }
      // A positive control. The `outline === 0` arm above is the whole point of
      // the assertion and is reachable from exactly one icon today, so without
      // this the branch is satisfied by never being taken.
      expect(unoutlined).toBeGreaterThan(0);
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
      // `rainbow` on purpose: most of the set is `t: 'none'` now, so a fixture
      // has to be one of the six icons where movement is the subject.
      const plain = renderToStaticMarkup(<TransitIcon name="rainbow" size={64} />);
      const quiet = renderToStaticMarkup(<TransitIcon name="rainbow" size={64} ticks={false} />);
      expect((plain.match(/<path/g) ?? []).length - (quiet.match(/<path/g) ?? []).length).toBe(3);
    });

    it('drops motion ticks below 32px and draws them at and above it', () => {
      const count = (size: number) =>
        (renderToStaticMarkup(<TransitIcon name="rainbow" size={size} />).match(/<path/g) ?? [])
          .length;
      // `rainbow` is two strokes with a `crown` tick set, so the difference
      // between the two is exactly the three ticks.
      expect(count(32) - count(24)).toBe(3);
    });

    it('draws no ticks for an icon whose set is `none`', () => {
      const quiet = renderToStaticMarkup(<TransitIcon name="saved" size={64} />);
      const loud = renderToStaticMarkup(<TransitIcon name="rainbow" size={64} />);
      // `saved` is one filled heart and nothing else; `rainbow` is two strokes
      // plus three ticks.
      expect(quiet.match(/<path/g)).toHaveLength(1);
      expect((loud.match(/<path/g) ?? []).length).toBeGreaterThan(2);
    });

    it('keeps ticks only where movement is the subject', () => {
      // Not a style preference, and the reason is arithmetic: the tick margin
      // is 12 units and the body outline is 9-13, so a tick drawn at body
      // weight fills 75-108% of the space it floats in and reads as a horn or
      // an ear rather than as motion. TICK_WEIGHT fixes the weight; this fixes
      // the COUNT. Measured on the contact sheet — `theater` was a horned
      // devil and every garment in Market grew a pair of ears.
      const ticked = Object.entries(ICON_DEFS)
        .filter(([, d]) => d.t !== 'none')
        .map(([slug]) => slug)
        .sort();
      // Three, and each survives the same test the other 73 failed: the tick
      // must not land on the end of a stem or on a straight edge, because a
      // mark in either place reads as a thing attached to the shape. `alerts`
      // ticks sideways off a bell, `disco` radiates off a sphere and
      // `rainbow` radiates off an arc — none of them has an upright for a
      // tick to sit on top of.
      expect(ticked).toEqual(['alerts', 'disco', 'rainbow']);
    });
  });

  // Exact count on purpose — it is the guard against a vacuous "every icon
  // renders" pass over an accidentally-empty set.
  it('has 104 icons and bumps stroke weight below 32px', () => {
    expect(TRANSIT_ICON_NAMES).toHaveLength(104);
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
