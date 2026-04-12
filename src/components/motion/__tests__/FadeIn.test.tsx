import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('motion/react', () => {
  const handler = (tag: string) => ({ children, className, ...rest }: any) => {
    const Tag = tag as any;
    return <Tag className={className}>{children}</Tag>;
  };
  return { motion: new Proxy({}, { get: (_t, tag: string) => handler(tag) }) };
});
import { FadeIn } from '../FadeIn';
describe('FadeIn', () => {
  it('should render children', () => { render(<FadeIn><span>Hello</span></FadeIn>); expect(screen.getByText('Hello')).toBeInTheDocument(); });
  it('should render as different tags', () => { const { container } = render(<FadeIn as="section"><span>Content</span></FadeIn>); expect(container.querySelector('section')).not.toBeNull(); });
});
