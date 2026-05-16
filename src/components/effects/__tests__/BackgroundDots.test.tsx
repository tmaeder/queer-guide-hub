/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BackgroundDots } from '../BackgroundDots';

describe('BackgroundDots', () => {
  it('renders children content', () => {
    render(<BackgroundDots><span>hi</span></BackgroundDots>);
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('renders a pointer-events-none overlay div', () => {
    const { container } = render(<BackgroundDots><span /></BackgroundDots>);
    expect(container.querySelector('.pointer-events-none')).toBeInTheDocument();
  });

  it('omits mask when fade=false', () => {
    const { container } = render(<BackgroundDots fade={false}><span /></BackgroundDots>);
    const overlay = container.querySelector('.pointer-events-none') as HTMLElement;
    expect(overlay.style.maskImage).toBe('');
  });
});
