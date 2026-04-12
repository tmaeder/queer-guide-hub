import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('motion/react', () => ({ motion: new Proxy({}, { get: (_t, tag: string) => ({ children, className }: any) => { const Tag = tag as any; return <Tag className={className}>{children}</Tag>; } }) }));
import { SlideIn } from '../SlideIn';
describe('SlideIn', () => {
  it('should render children', () => { render(<SlideIn><span>Panel</span></SlideIn>); expect(screen.getByText('Panel')).toBeInTheDocument(); });
  it('should render as section', () => { const { container } = render(<SlideIn as="section">Content</SlideIn>); expect(container.querySelector('section')).not.toBeNull(); });
});
