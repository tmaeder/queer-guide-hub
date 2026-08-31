import { describe, it, expect } from 'vitest';
import { CATEGORY_LINES, CATEGORY_LINE_ORDER, lineForCategory } from '../categoryIdentity';
import { parentOrder } from '@/components/resources/categoryMeta';
import { TRANSIT_ICON_NAMES } from '@/components/transit/transitIconPaths';

describe('categoryIdentity', () => {
  it('covers every taxonomy parent, in canonical order', () => {
    expect(CATEGORY_LINE_ORDER).toHaveLength(parentOrder.length);
    expect(CATEGORY_LINE_ORDER.map((l) => l.name)).toEqual(parentOrder);
  });

  it('uses only real TransitIcon names', () => {
    // A typo here renders an empty <svg> rather than throwing, so nothing else
    // would catch it.
    for (const line of CATEGORY_LINE_ORDER) {
      expect(TRANSIT_ICON_NAMES, line.name).toContain(line.icon);
    }
  });

  it('gives every line a distinct slug', () => {
    const slugs = CATEGORY_LINE_ORDER.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every line a distinct icon — the icon IS the identity', () => {
    // Deliberately monochrome: parents are told apart by icon, not by track
    // colour, so two parents sharing an icon is the failure this guards.
    const icons = CATEGORY_LINE_ORDER.map((l) => l.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('carries no track colour', () => {
    // Pink `#` is the tag page's one accent. If a `track` field ever appears
    // here, the rail has started competing with the tag bullet.
    for (const line of CATEGORY_LINE_ORDER) {
      expect(line).not.toHaveProperty('track');
    }
  });

  it('resolves by name and by slug, and misses safely', () => {
    expect(lineForCategory('Health')?.slug).toBe('health');
    expect(lineForCategory('health')?.name).toBe('Health');
    expect(lineForCategory('Gender')).toBeUndefined(); // a stop, not a line
    expect(lineForCategory(null)).toBeUndefined();
    expect(lineForCategory('')).toBeUndefined();
  });

  it('keys the record by name', () => {
    expect(Object.keys(CATEGORY_LINES).sort()).toEqual([...parentOrder].sort());
  });
});
