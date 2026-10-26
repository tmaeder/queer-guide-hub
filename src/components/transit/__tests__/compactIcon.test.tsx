import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TransitIcon } from '../TransitIcon';
import { compactIcon } from '../compactIcon';
import { ICON_DEFS, inkPathOf } from '../iconDefs';

describe('compact icon artwork', () => {
  it('collapses tiny casing/core pairs without changing their geometry', () => {
    const source = ICON_DEFS.rainbow;
    const compact = compactIcon('rainbow', source);
    expect(compact.l).toEqual([[source.l![0][0], null, 1]]);
    // The large artwork and favicon derivation must remain untouched.
    expect(source.l![0][2]).toBe(2.2);
    expect(inkPathOf(compact)).toBe(inkPathOf(source));
  });

  it('gives a calendar a wider counter in colour and standalone map markup', () => {
    const small = compactIcon('events', ICON_DEFS.events);
    expect(small.f![0]).toBe(ICON_DEFS.events.f![0]);
    expect(small.f![1][0]).toContain('a 11 11');
    const mono = renderToStaticMarkup(<TransitIcon name="events" size={20} color="#111111" />);
    expect(mono).toContain('a 11 11');
    expect(mono).not.toContain('currentColor');
    expect(mono).toContain('width="20"');
  });

  it('keeps hollow saved states distinct without losing the small-size casing', () => {
    const off = renderToStaticMarkup(<TransitIcon name="saved" size={16} hollow />);
    const on = renderToStaticMarkup(<TransitIcon name="saved" size={16} />);
    expect(off).toContain('fill="none"');
    expect(on).toContain(`fill="${ICON_DEFS.saved.hex}"`);
    expect(off).toContain('stroke-width="7.5"');
    expect(on).toContain('stroke-width="7.5"');
  });

  it('restores original details for a large illustration', () => {
    const large = renderToStaticMarkup(<TransitIcon name="chat" size={64} />);
    const small = renderToStaticMarkup(<TransitIcon name="chat" size={16} />);
    expect(large).toContain('a 3.5 3.5');
    expect(small).not.toContain('a 3.5 3.5');
    expect(small).toContain('a 1 1');
    expect(large).toContain('width="64"');
  });
});
