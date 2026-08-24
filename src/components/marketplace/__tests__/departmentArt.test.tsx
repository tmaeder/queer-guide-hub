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

  // ONE LINE, ONE HUE. The masthead calls this surface "Marketplace · Yellow
  // line". Reaching for a second track colour here would assert a second route
  // that does not exist — the four-track licence `CityNetwork` holds does not
  // extend to a stop list. This is the guard on that rule.
  it('draws every plate on the yellow track and no other', () => {
    for (const [i, slug] of DEPARTMENT_ORDER.entries()) {
      const { container, unmount } = render(
        <DepartmentArt slug={slug} index={i} count={DEPARTMENT_ORDER.length} />,
      );
      const html = container.innerHTML;
      expect(html, slug).toContain('stroke-track-yellow');
      for (const other of ['track-pink', 'track-blue', 'track-green']) {
        expect(html, `${slug} must not carry ${other}`).not.toContain(other);
      }
      unmount();
    }
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
