import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
vi.mock('motion/react', () => ({
  motion: { span: (props: any) => <span {...props} /> },
  useInView: () => true,
  useMotionValue: () => ({ on: () => () => {}, set: vi.fn(), get: () => 0 }),
  animate: vi.fn(() => ({ stop: vi.fn() })),
  useReducedMotion: () => false,
}));
import { AnimatedCounter } from '../AnimatedCounter';
describe('AnimatedCounter', () => {
  it('should render with prefix and suffix', () => {
    const { container } = render(<AnimatedCounter value={42} prefix="$" suffix="k" />);
    expect(container.textContent).toContain('$');
    expect(container.textContent).toContain('k');
  });
  it('should render without crashing', () => {
    const { container } = render(<AnimatedCounter value={100} />);
    expect(container.querySelector('span')).not.toBeNull();
  });
});
