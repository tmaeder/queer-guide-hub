import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('motion/react', () => ({ motion: new Proxy({}, { get: (_t, tag: string) => ({ children, className, style }: any) => { const Tag = tag as any; return <Tag className={className}>{children}</Tag>; } }), useScroll: () => ({ scrollYProgress: { get: () => 0 } }), useTransform: () => 0 }));
import { Parallax } from '../Parallax';
describe('Parallax', () => {
  it('should render children', () => { render(<Parallax><img src="" alt="test" /></Parallax>); expect(document.querySelector('img')).not.toBeNull(); });
});
