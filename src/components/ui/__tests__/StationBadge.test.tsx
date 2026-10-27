import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StationBadge } from '../StationBadge';

describe('StationBadge', () => {
  const classes = () => {
    const { container } = render(<StationBadge glyph="globe" />);
    return (container.querySelector('[data-station-badge]') as HTMLElement).className.split(/\s+/);
  };

  it('hides itself only when its OWN card shows a plate', () => {
    const cls = classes();
    expect(cls).toContain('group-has-[[data-fallback=station]]/card:hidden');
    // An unnamed group-has matches any ancestor `group`, so one card's plate
    // hides every badge in a section that is itself a group.
    expect(cls).not.toContain('group-has-[[data-fallback=station]]:hidden');
  });

  it('carries exactly one size, matching the -mt-8 seam offset the cards use', () => {
    const sizes = classes().filter((c) => /^size-\d+$/.test(c));
    expect(sizes).toEqual(['size-14']);
  });
});
