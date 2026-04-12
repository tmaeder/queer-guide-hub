import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: (_t, tag: string) => ({ children, className }: any) => { const Tag = tag as any; return <Tag className={className}>{children}</Tag>; } }),
}));
import { ScrollReveal } from '../ScrollReveal';
describe('ScrollReveal', () => {
  it('should render children', () => {
    render(<ScrollReveal><span>Revealed</span></ScrollReveal>);
    expect(screen.getByText('Revealed')).toBeInTheDocument();
  });

  it('should render as section', () => {
    const { container } = render(<ScrollReveal component="section">Content</ScrollReveal>);
    expect(container.querySelector('section')).not.toBeNull();
  });
});
