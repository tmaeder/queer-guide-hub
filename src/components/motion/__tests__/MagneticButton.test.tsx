import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({ children, className, ..._rest }: unknown) => {
          const Tag = tag as unknown;
          return <Tag className={className}>{children}</Tag>;
        },
    },
  ),
  useMotionValue: () => ({ set: vi.fn(), get: () => 0 }),
  useSpring: (v: unknown) => v,
  useReducedMotion: () => false,
}));
import { MagneticButton } from '../MagneticButton';
describe('MagneticButton', () => {
  it('should render children', () => {
    render(
      <MagneticButton>
        <button>CTA</button>
      </MagneticButton>,
    );
    expect(screen.getByText('CTA')).toBeInTheDocument();
  });
});
