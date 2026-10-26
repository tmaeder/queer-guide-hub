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

  it('gives compact calendar artwork a wider counter without changing large markup', () => {
    const small = compactIcon('events', ICON_DEFS.events);
    expect(small.f![0]).toBe(ICON_DEFS.events.f![0]);
    expect(small.f![1][0]).toContain('a 11 11');
    const mono = renderToStaticMarkup(<TransitIcon name="events" size={20} color="#111111" />);
    expect(inkPathOf(small)).toContain('a 11 11');
    expect(mono).not.toContain('a 11 11');
    expect(mono).not.toContain('currentColor');
    expect(mono).toContain('width="64"');
  });

  it('keeps hollow saved states distinct at the 64px rendered minimum', () => {
    const off = renderToStaticMarkup(<TransitIcon name="saved" size={16} hollow />);
    const on = renderToStaticMarkup(<TransitIcon name="saved" size={16} />);
    expect(off).toContain('fill="none"');
    expect(on).toContain(`fill="${ICON_DEFS.saved.hex}"`);
    expect(off).toContain('stroke-width="9"');
    expect(on).toContain('stroke-width="9"');
  });

  it('preserves large details when a small requested size is raised to 64px', () => {
    const large = renderToStaticMarkup(<TransitIcon name="chat" size={64} />);
    const small = renderToStaticMarkup(<TransitIcon name="chat" size={16} />);
    expect(large).toContain('a 3.5 3.5');
    expect(small).toContain('a 3.5 3.5');
    expect(small).toContain('width="64"');
    expect(large).toContain('width="64"');
  });
});
