import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('motion/react', () => ({ motion: new Proxy({}, { get: (_t, tag: string) => (props: Record<string, unknown>) => { const { children, className, disabled, ..._rest } = props; const Tag = tag as unknown as keyof JSX.IntrinsicElements; return <Tag className={className} disabled={disabled}>{children}</Tag>; } }), useReducedMotion: () => false }));
import { Tappable } from '../Tappable';
describe('Tappable', () => {
  it('should render children as button by default', () => { render(<Tappable>Click me</Tappable>); expect(screen.getByText('Click me')).toBeInTheDocument(); });
  it('should render as div', () => { const { container } = render(<Tappable as="div">Content</Tappable>); expect(container.querySelector('div')).not.toBeNull(); });
});
