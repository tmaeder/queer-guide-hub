/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GrainOverlay } from '../GrainOverlay';

describe('GrainOverlay', () => {
  // 2026-05-19 — decorative SVG grain effect gutted as part of the monochrome
  // refactor (commit 6efd9835). Renders nothing; opacity prop accepted for
  // API compatibility but has no rendered effect.
  it('renders null', () => {
    const { container } = render(<GrainOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('accepts opacity prop without throwing', () => {
    expect(() => render(<GrainOverlay opacity={0.5} />)).not.toThrow();
  });
});
