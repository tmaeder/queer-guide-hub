import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
vi.mock('@/components/motion', () => ({ Parallax: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
import { DetailHero } from '../DetailHero';
describe('DetailHero', () => {
  it('should render fallback image when no imageUrl', () => { const { container } = render(<DetailHero imageUrl={null} alt="test" />); const img = container.querySelector('img'); expect(img).not.toBeNull(); expect(img?.getAttribute('src') ?? '').toMatch(/\.(webp|jpe?g|png)$/); });
  it('should render image when imageUrl provided', () => { const { container } = render(<DetailHero imageUrl="https://img.test/hero.jpg" alt="Hero" />); expect(container.querySelector('img')).not.toBeNull(); expect(container.querySelector('img')?.getAttribute('alt')).toBe('Hero'); });
});
