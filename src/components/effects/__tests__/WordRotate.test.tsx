/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: { span: (p: React.HTMLAttributes<HTMLSpanElement>) => <span {...p} /> },
  useReducedMotion: () => true,
}));

import { WordRotate } from '../WordRotate';

describe('WordRotate', () => {
  it('renders the first word', () => {
    render(<WordRotate words={['one', 'two', 'three']} />);
    expect(screen.getByText('one')).toBeInTheDocument();
  });

  it('passes className through to the wrapper span', () => {
    const { container } = render(<WordRotate words={['x']} className="my-class" />);
    expect(container.firstChild).toHaveClass('my-class');
  });
});
