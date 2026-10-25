import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DepartmentArt } from '@/components/marketplace/DepartmentArt';
import { PicksPlate } from '@/components/marketplace/PicksPlate';
import {
  DEPARTMENT_GLYPHS,
  PLATE_H,
  PLATE_W,
  departmentGlyph,
} from '@/components/marketplace/departmentPlate';
import { TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';
import { DEPARTMENT_ORDER } from '@/lib/marketplaceTaxonomy';

describe('department category art', () => {
  // The defect this whole component replaces: `useDepartmentCovers` resolved a
  // cover for six of eleven departments, so the browse grid mixed image tiles
  // with bare text tiles. Coverage is now total by construction — assert it,
  // because a new department slug added to the taxonomy with no glyph would
  // silently fall back to `shop` and re-open the same hole in a quieter way.
  it('has a distinct mark for every department in the taxonomy', () => {
    for (const slug of DEPARTMENT_ORDER) {
      expect(DEPARTMENT_GLYPHS[slug], slug).toBeDefined();
      expect(TRANSIT_ICON_PATHS[departmentGlyph(slug)], slug).toBeTruthy();
    }
    // `other` is the only department allowed to share `shop` — every other
    // department must be told apart by its own mark, or the plates stop
    // carrying information and become wallpaper.
    const marks = DEPARTMENT_ORDER.filter((d) => d !== 'other').map((d) => departmentGlyph(d));
    expect(new Set(marks).size).toBe(marks.length);
  });

  // ONE LINE, ONE HUE — FOR THE LINE. This guard used to also require that no
  // other track colour appeared anywhere in the plate, on the rule that a
  // second hue asserts a second route. Icon System v2 reversed that for the
  // MARK (see the header of DepartmentArt.tsx): a department's glyph now
  // carries its own hue, the same one it carries in the glossary and the nav.
  //
  // THE OLD ASSERTION WOULD STILL HAVE PASSED, AND THAT IS THE POINT OF
  // REWRITING IT RATHER THAN DELETING IT. It searched for the class names
  // `track-pink` / `track-blue` / `track-green`, while a v2 mark arrives as a
  // literal hex — so it went green over plates that are visibly pink and cyan.
  // An assertion that cannot see the thing it forbids is worse than none.
  //
  // What still holds, and what this now checks, is the half that carries the
  // meaning: the ROUTE is yellow on every plate, because the stroke running
  // between the stations is what says "one line, eleven stops".
  it('draws the route in yellow on every plate', () => {
    for (const [i, slug] of DEPARTMENT_ORDER.entries()) {
      const { container, unmount } = render(
        <DepartmentArt slug={slug} index={i} count={DEPARTMENT_ORDER.length} />,
      );
      const route = container.querySelector('path.stroke-track-yellow');
      expect(route, `${slug} route stroke`).not.toBeNull();
      // No OTHER track class on the route itself — a hex mark is fine, a
      // second coloured route is not.
      for (const other of ['track-pink', 'track-blue', 'track-green']) {
        expect(
          container.querySelector(`path.stroke-${other}`),
          `${slug} must not draw a ${other} route`,
        ).toBeNull();
      }
      unmount();
    }
  });

  // The marks are genuinely coloured now, which is the visible half of the v2
  // change on this surface. Asserted positively so "the plates went monochrome
  // again" fails here rather than being noticed on the page.
  it('renders each department mark in its own track colour', () => {
    const hues = new Set<string>();
    for (const [i, slug] of DEPARTMENT_ORDER.entries()) {
      const { container, unmount } = render(
        <DepartmentArt slug={slug} index={i} count={DEPARTMENT_ORDER.length} />,
      );
      for (const m of container.innerHTML.matchAll(/#(?:FF1F8F|00B4E6|2BE05A|FFD500)/gi))
        hues.add(m[0].toUpperCase());
      unmount();
    }
    // More than one, or the surface is effectively still single-hue and this
    // test is decorative.
    expect(hues.size).toBeGreaterThan(1);
  });

  // The plates are windows onto ONE shared line, which is the only reason a
  // row of them reads as a route. Tile `i` must show the slice
  // `[i * PLATE_W, (i + 1) * PLATE_W]` — if the viewBox ever stops advancing
  // with the index, every tile draws the same stretch of track and the
  // continuity is gone with no visual error to notice.
  it('windows a different slice of the shared line per tile', () => {
    const boxes = DEPARTMENT_ORDER.map((slug, i) => {
      const { container, unmount } = render(
        <DepartmentArt slug={slug} index={i} count={DEPARTMENT_ORDER.length} />,
      );
      const box = container.querySelector('svg')!.getAttribute('viewBox');
      unmount();
      return box;
    });
    expect(new Set(boxes).size).toBe(DEPARTMENT_ORDER.length);
    expect(boxes[0]).toBe(`0 0 ${PLATE_W} ${PLATE_H}`);
    expect(boxes[3]).toBe(`${3 * PLATE_W} 0 ${PLATE_W} ${PLATE_H}`);
  });

  // lineGeometry invariant 2, at this call site: the track bends everywhere.
  // A plate whose path degenerated to a straight run would break hard rule #1
  // and nothing else would catch it, because it would still render.
  it('never emits a straight-line command', () => {
    const { container } = render(<DepartmentArt slug="apparel" index={0} count={11} />);
    const d = container.querySelector('path')!.getAttribute('d')!;
    expect(d).toContain('C');
    expect(d).not.toMatch(/[LHV]/);
  });

  // The category index reuses this plate for group tiles; `glyph` must win over
  // the department's own mark, or every Apparel tile draws the T-shirt again.
  it('draws an explicit glyph instead of the department mark', () => {
    const html = (glyph?: 'shoe') =>
      render(<DepartmentArt slug="apparel" index={0} count={3} glyph={glyph} />).container
        .innerHTML;
    expect(html('shoe')).not.toBe(html());
  });

  it('inverts to the ink treatment for the active stop', () => {
    const { container } = render(<DepartmentArt slug="apparel" index={0} count={11} active />);
    // Yellow survives the inversion — a track colour is identity, not a tone.
    expect(container.innerHTML).toContain('stroke-track-yellow');
    expect(container.innerHTML).toContain('fill-foreground');
  });
});

describe('PicksPlate', () => {
  // The clamp is what keeps a 40-pick collection from drawing as a dotted
  // rule, and a 1-pick one from having too few crests to bend.
  it('clamps the station run to 3..7 stops', () => {
    const stations = (stops: number) => {
      const { container, unmount } = render(<PicksPlate stops={stops} />);
      const n = container.querySelectorAll('circle').length;
      unmount();
      return n;
    };
    expect(stations(1)).toBe(3);
    expect(stations(0)).toBe(3);
    expect(stations(5)).toBe(5);
    expect(stations(40)).toBe(7);
  });

  // Two lines at the same station count trace each other exactly — the
  // `MarketplaceLineArt` rule. The ghost must run at a different n.
  it('draws the ghost route at a different station count from the live one', () => {
    const { container } = render(<PicksPlate stops={5} />);
    const paths = Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('d'));
    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toBe(paths[1]);
  });

  it('inverts the ghost for the paper tone so it cannot vanish into ink', () => {
    const ink = render(<PicksPlate stops={4} tone="ink" />);
    expect(ink.container.innerHTML).toContain('stroke-background/20');
    ink.unmount();
    const paper = render(<PicksPlate stops={4} tone="paper" />);
    expect(paper.container.innerHTML).toContain('stroke-foreground/15');
  });
});
