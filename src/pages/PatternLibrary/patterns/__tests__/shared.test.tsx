/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { Logo, PrideBar, TopNav } from '../shared';

describe('PatternLibrary/shared', () => {
  it('Logo renders', () => {
    const { container } = render(<Logo />);
    expect(container).toBeTruthy();
  });
  it('PrideBar renders', () => {
    const { container } = render(<PrideBar />);
    expect(container).toBeTruthy();
  });
  it('TopNav renders', () => {
    const { container } = render(<TopNav />);
    expect(container).toBeTruthy();
  });
});
