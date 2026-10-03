import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({ children, className }: Record<string, unknown>) => {
          const Tag = tag as unknown as keyof JSX.IntrinsicElements;
          return <Tag className={className}>{children}</Tag>;
        },
    },
  ),
}));
import { ScrollReveal } from '../ScrollReveal';
describe('ScrollReveal', () => {
  it('should render children', () => {
    const { container } = render(
      <ScrollReveal>
        <span>Revealed</span>
      </ScrollReveal>,
    );
    expect(screen.getByText('Revealed')).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('data-motion', 'reveal');
  });

  it('should render as section', () => {
    const { container } = render(<ScrollReveal component="section">Content</ScrollReveal>);
    expect(container.querySelector('section')).not.toBeNull();
  });
});
