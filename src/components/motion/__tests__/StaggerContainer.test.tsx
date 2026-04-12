import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('motion/react', () => {
  const handler = (tag: string) => ({ children, className, style, ..._rest }: unknown) => {
    const Tag = tag as unknown;
    return <Tag className={className} style={style}>{children}</Tag>;
  };
  return { motion: new Proxy({}, { get: (_t, tag: string) => handler(tag) }) };
});
import { StaggerContainer } from '../StaggerContainer';
describe('StaggerContainer', () => {
  it('should render children', () => { render(<StaggerContainer><div>Item 1</div><div>Item 2</div></StaggerContainer>); expect(screen.getByText('Item 1')).toBeInTheDocument(); expect(screen.getByText('Item 2')).toBeInTheDocument(); });
  it('should render as ul', () => { const { container } = render(<StaggerContainer as="ul"><li>A</li></StaggerContainer>); expect(container.querySelector('ul')).not.toBeNull(); });
});
