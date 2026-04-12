import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageLoadingState } from '../PageLoadingState';
describe('PageLoadingState', () => {
  it('should render loading skeleton', () => {
    const { container } = render(<PageLoadingState />);
    expect(container.children.length).toBeGreaterThan(0);
  });
  it('should accept count prop', () => {
    const { container } = render(<PageLoadingState count={3} />);
    expect(container.children.length).toBeGreaterThan(0);
  });
});
