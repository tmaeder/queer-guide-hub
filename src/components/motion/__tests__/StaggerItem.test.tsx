import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('motion/react', () => ({ motion: new Proxy({}, { get: (_t, tag: string) => ({ children, className }: any) => { const Tag = tag as any; return <Tag className={className}>{children}</Tag>; } }) }));
import { StaggerItem } from '../StaggerItem';
describe('StaggerItem', () => {
  it('should render children', () => { render(<StaggerItem><span>Item</span></StaggerItem>); expect(screen.getByText('Item')).toBeInTheDocument(); });
  it('should render as li', () => { const { container } = render(<StaggerItem as="li">List item</StaggerItem>); expect(container.querySelector('li')).not.toBeNull(); });
});
