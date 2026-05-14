import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
vi.mock('@/components/motion', () => ({ Parallax: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/effects/SpotlightEffect', () => ({ SpotlightEffect: () => <div data-testid="spotlight" /> }));
import { DetailHero } from '../DetailHero';
describe('DetailHero', () => {
  it('should render fallback image when no imageUrl', () => { const { container } = render(<DetailHero imageUrl={null} alt="test" />); const img = container.querySelector('img'); expect(img).not.toBeNull(); expect(img?.getAttribute('src')).toMatch(/fallback/); });
  it('should render image when imageUrl provided', () => { const { container } = render(<DetailHero imageUrl="https://img.test/hero.jpg" alt="Hero" />); expect(container.querySelector('img')).not.toBeNull(); expect(container.querySelector('img')?.getAttribute('alt')).toBe('Hero'); });
  it('renders a fallback image when no imageUrl is provided', () => {
    const { container } = render(<DetailHero imageUrl={null} alt="test" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('test');
  });
  it('renders the provided image when imageUrl is set', () => {
    const { container } = render(<DetailHero imageUrl="https://img.test/hero.jpg" alt="Hero" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://img.test/hero.jpg');
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Hero');
  });
  it('renders title and eyebrow when supplied', () => {
    const { getByText } = render(<DetailHero imageUrl="https://img.test/h.jpg" alt="x" eyebrow="Eyebrow" title="A Title" />);
    expect(getByText('A Title')).toBeTruthy();
    expect(getByText('Eyebrow')).toBeTruthy();
  });
});
