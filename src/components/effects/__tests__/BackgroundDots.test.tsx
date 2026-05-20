/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BackgroundDots } from '../BackgroundDots';

describe('BackgroundDots', () => {
  // 2026-05-19 — decorative effect gutted as part of the monochrome refactor
  // (commit 6efd9835). Renders nothing; the old shimmer + children-wrap
  // behavior is gone. Consumers migrated to plain backgrounds / borders.
  it('renders null', () => {
    const { container } = render(<BackgroundDots />);
    expect(container.firstChild).toBeNull();
  });

  it('accepts density + variant props without throwing', () => {
    expect(() => render(<BackgroundDots density="high" variant="soft" />)).not.toThrow();
  });
});
