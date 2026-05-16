/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GrainOverlay } from '../GrainOverlay';

describe('GrainOverlay', () => {
  it('renders aria-hidden div with default opacity', () => {
    const { container } = render(<GrainOverlay />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveAttribute('aria-hidden');
    expect(el.style.opacity).toBe('0.03');
  });

  it('honors custom opacity', () => {
    const { container } = render(<GrainOverlay opacity={0.5} />);
    expect((container.firstChild as HTMLElement).style.opacity).toBe('0.5');
  });

  it('uses pointer-events-none', () => {
    const { container } = render(<GrainOverlay />);
    expect(container.firstChild).toHaveClass('pointer-events-none');
  });
});
