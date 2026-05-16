/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: { div: (p: React.HTMLAttributes<HTMLDivElement>) => <div {...p} /> },
}));

import { SkeletonCrossfade } from '../SkeletonCrossfade';

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
});
