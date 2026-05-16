/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('renders with default Loading label', () => {
    render(<Spinner />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument();
  });

  it('honors custom label', () => {
    render(<Spinner label="Fetching trips" />);
    expect(screen.getByRole('progressbar', { name: 'Fetching trips' })).toBeInTheDocument();
  });

  it('applies custom size to the icon', () => {
    const { container } = render(<Spinner size={48} />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.style.width).toBe('48px');
    expect(svg.style.height).toBe('48px');
  });

  it('passes through extra className', () => {
    render(<Spinner className="my-class" />);
    expect(screen.getByRole('progressbar')).toHaveClass('my-class');
  });
});
