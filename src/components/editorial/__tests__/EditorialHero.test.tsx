/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorialHero } from '../EditorialHero';

const baseImage = {
  src: 'https://example.com/hero.jpg',
  fallback: '/images/fallback/local.webp',
  alt: 'Friends gathered for a celebration',
};

describe('EditorialHero', () => {
  it('renders title, subtitle, and image with alt text', () => {
    render(
      <EditorialHero
        title="Hello"
        subtitle="A subtitle"
        image={baseImage}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('A subtitle')).toBeInTheDocument();
    const img = screen.getByAltText(baseImage.alt) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe(baseImage.src);
  });

  it('falls back to the local image when the remote one errors', () => {
    render(<EditorialHero title="X" image={baseImage} />);
    const img = screen.getByAltText(baseImage.alt) as HTMLImageElement;
    fireEvent.error(img);
    expect(img.src).toContain('/images/fallback/local.webp');
  });

  it('renders eyebrow when provided', () => {
    render(<EditorialHero eyebrow="Section" title="Hi" image={baseImage} />);
    expect(screen.getByText('Section')).toBeInTheDocument();
  });

  it('renders in side layout without scrim', () => {
    const { container } = render(
      <EditorialHero title="Side" image={baseImage} imagePosition="side" />,
    );
    expect(screen.getByRole('heading', { name: 'Side' })).toBeInTheDocument();
    // scrim has bg-gradient-to-b class — should NOT be present in side layout
    expect(container.querySelector('.bg-gradient-to-b')).toBeNull();
  });
});
