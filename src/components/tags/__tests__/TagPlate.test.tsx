import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TagPlate, TAG_PLATE_H, TAG_PLATE_W } from '@/components/tags/TagPlate';
import { CATEGORY_LINES, DEFAULT_CATEGORY_ICON } from '@/lib/tags/categoryIdentity';
import { TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';

describe('TagPlate', () => {
  // Glyph resolution must be total: every taxonomy parent resolves to a real
  // icon path, and an unmapped/missing line falls back to the library glyph
  // instead of an undefined `d` (which renders nothing with no error).
  it('resolves a real glyph for every taxonomy line and for no line at all', () => {
    for (const line of Object.values(CATEGORY_LINES)) {
      expect(TRANSIT_ICON_PATHS[line.icon], line.name).toBeTruthy();
    }
    expect(TRANSIT_ICON_PATHS[DEFAULT_CATEGORY_ICON]).toBeTruthy();
    const { container } = render(<TagPlate />);
    const glyphPath = container.querySelectorAll('path')[1];
    expect(glyphPath.getAttribute('d')).toBe(TRANSIT_ICON_PATHS[DEFAULT_CATEGORY_ICON]);
  });

  // Pink is the tag system's one accent (`ROUTE_BULLET_MAP.tag`), and
  // `categoryIdentity.ts` rules that a taxonomy line is identified by ICON,
  // never by hue — so no other track colour may appear, whatever the line.
  it('draws every plate on the pink track and no other', () => {
    for (const line of [undefined, ...Object.values(CATEGORY_LINES)]) {
      const { container, unmount } = render(<TagPlate line={line} index={0} />);
      const html = container.innerHTML;
      expect(html, line?.name ?? 'no line').toContain('stroke-track-pink');
      for (const other of ['track-yellow', 'track-blue', 'track-green']) {
        expect(html, `${line?.name ?? 'no line'} must not carry ${other}`).not.toContain(other);
      }
      unmount();
    }
  });

  // The O(1) parity construction must still be the windowed shared line:
  // adjacent tiles mirror each other, tiles two apart are identical, and the
  // shape is deterministic for a given index.
  it('alternates the track by index parity, deterministically', () => {
    const trackD = (index: number) => {
      const { container, unmount } = render(<TagPlate index={index} />);
      const path = container.querySelectorAll('path')[0];
      const d = `${path.getAttribute('d')}|${path.getAttribute('transform') ?? ''}`;
      unmount();
      return d;
    };
    expect(trackD(0)).toBe(trackD(0));
    expect(trackD(0)).toBe(trackD(2));
    expect(trackD(1)).toBe(trackD(3));
    expect(trackD(0)).not.toBe(trackD(1));
  });

  // The parity trick must join seamlessly: an even tile's track ends at its
  // right edge exactly where the next (odd) tile's track begins at its left
  // edge, or the grid stops reading as one route. The even segment ends at
  // x = TAG_PLATE_W; the odd segment starts at x = TAG_PLATE_W and is
  // translated left by one window — same point, same y.
  it('joins the even and odd windows at a shared crest', () => {
    const seg = (index: number) => {
      const { container, unmount } = render(<TagPlate index={index} />);
      const path = container.querySelectorAll('path')[0];
      const d = path.getAttribute('d')!;
      unmount();
      return d;
    };
    const evenEnd = seg(0).split('C').pop()!.trim().split(',').pop()!.trim();
    const oddStart = seg(1).match(/^M ([\d.]+) ([\d.]+)/)!;
    // Even tile's last endpoint is (TAG_PLATE_W, y); odd tile starts at
    // (TAG_PLATE_W, y) pre-translation. Same coordinates ⇒ seamless join.
    expect(evenEnd).toBe(`${oddStart[1]} ${oddStart[2]}`);
  });

  // lineGeometry invariant 2, at this call site: the track bends everywhere.
  it('never emits a straight-line command', () => {
    for (const index of [0, 1]) {
      const { container, unmount } = render(<TagPlate index={index} />);
      const d = container.querySelectorAll('path')[0].getAttribute('d')!;
      expect(d).toContain('C');
      expect(d).not.toMatch(/[LHV]/);
      unmount();
    }
  });

  it('keeps the 4:3 glossary card aspect', () => {
    expect(TAG_PLATE_W / TAG_PLATE_H).toBeCloseTo(4 / 3);
    const { container } = render(<TagPlate />);
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe(
      `0 0 ${TAG_PLATE_W} ${TAG_PLATE_H}`,
    );
  });

  // DepartmentArt's measured dark-mode fix, inherited: the disc pair must be
  // background/foreground — `fill-card stroke-track-ring` renders an invisible
  // disc on a dark field even though the class names read correctly.
  it('parks the glyph on a background disc with a foreground ring', () => {
    const { container } = render(<TagPlate />);
    const disc = container.querySelector('circle')!;
    expect(disc.getAttribute('class')).toContain('fill-background');
    expect(disc.getAttribute('class')).toContain('stroke-foreground');
  });
});
