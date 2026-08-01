/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ initial: _i, animate: _a, exit: _e, transition: _t, ...p }: Record<string, unknown>) => (
      // Mark the animated wrapper so the reduced-motion test can assert it is gone.
      <div data-animated="true" {...(p as React.HTMLAttributes<HTMLDivElement>)} />
    ),
  },
}));

let mockReduced = false;
vi.mock('@/lib/motion', () => ({
  useMotionTokens: () => ({ reduced: mockReduced }),
}));

import { SkeletonCrossfade } from '../SkeletonCrossfade';

beforeEach(() => {
  mockReduced = false;
});

describe('SkeletonCrossfade', () => {
  it('renders skeleton while loading', () => {
    render(<SkeletonCrossfade loading skeleton={<div>SK</div>}><div>C</div></SkeletonCrossfade>);
    expect(screen.getByText('SK')).toBeInTheDocument();
    expect(screen.queryByText('C')).toBeNull();
  });

  it('renders children when not loading', () => {
    render(<SkeletonCrossfade loading={false} skeleton={<div>SK</div>}><div>C</div></SkeletonCrossfade>);
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('SK')).toBeNull();
  });

  describe('prefers-reduced-motion', () => {
    // Regression: the crossfade is a JS opacity tween, so the CSS media query
    // never reached it. A reduced-motion user still got the 300ms blur-and-fade,
    // and the axe sweep — which runs with reducedMotion: 'reduce' — could sample
    // a rail mid-fade. Partially transparent card-foreground over the dark
    // background reads as #5f5f5f on #0a0a0a: a phantom 3.1:1 contrast failure.
    it('skips the animated wrapper entirely', () => {
      mockReduced = true;
      const { container } = render(
        <SkeletonCrossfade loading={false} skeleton={<div>SK</div>}><div>C</div></SkeletonCrossfade>,
      );
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(container.querySelectorAll('[data-animated="true"]').length).toBe(0);
    });

    it('still swaps skeleton and content', () => {
      mockReduced = true;
      const { rerender } = render(
        <SkeletonCrossfade loading skeleton={<div>SK</div>}><div>C</div></SkeletonCrossfade>,
      );
      expect(screen.getByText('SK')).toBeInTheDocument();
      expect(screen.queryByText('C')).toBeNull();

      rerender(<SkeletonCrossfade loading={false} skeleton={<div>SK</div>}><div>C</div></SkeletonCrossfade>);
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.queryByText('SK')).toBeNull();
    });
  });

  it('uses the animated wrapper when motion is allowed', () => {
    const { container } = render(
      <SkeletonCrossfade loading={false} skeleton={<div>SK</div>}><div>C</div></SkeletonCrossfade>,
    );
    expect(container.querySelectorAll('[data-animated="true"]').length).toBe(1);
  });
});
