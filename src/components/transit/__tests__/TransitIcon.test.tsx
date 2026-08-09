import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { TRANSIT_ICON_NAMES } from '@/components/transit/transitIconPaths';

describe('TransitIcon', () => {
  it('renders a stroke-only svg for every name', () => {
    for (const name of TRANSIT_ICON_NAMES) {
      const { container, unmount } = render(<TransitIcon name={name} />);
      const path = container.querySelector('path');
      expect(path, name).not.toBeNull();
      expect(path!.getAttribute('fill')).toBe('none');
      expect(path!.getAttribute('stroke')).toBe('currentColor');
      unmount();
    }
  });

  it('has 42 icons and bumps stroke weight below 32px', () => {
    expect(TRANSIT_ICON_NAMES).toHaveLength(42);
    const { container } = render(<TransitIcon name="search" size={24} />);
    expect(container.querySelector('path')!.getAttribute('stroke-width')).toBe('10');
    const { container: big } = render(<TransitIcon name="search" size={48} />);
    expect(big.querySelector('path')!.getAttribute('stroke-width')).toBe('9');
  });

  it('is aria-hidden by default, labelled when told', () => {
    const { container } = render(<TransitIcon name="search" />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    render(<TransitIcon name="search" label="Search" />);
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });
});
