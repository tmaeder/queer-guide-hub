import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MasterSymbol } from '@/components/brand/MasterSymbol';
import { Wordmark } from '@/components/brand/Wordmark';

describe('brand', () => {
  it('MasterSymbol is stroke-only currentColor', () => {
    const { container } = render(<MasterSymbol />);
    const g = container.querySelector('g')!;
    expect(g.getAttribute('stroke')).toBe('currentColor');
    expect(g.getAttribute('fill')).toBe('none');
  });
  it('MasterSymbol is decorative by default, labelled on demand', () => {
    const { container } = render(<MasterSymbol />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    render(<MasterSymbol label="queer.guide" />);
    expect(screen.getByLabelText('queer.guide')).toBeInTheDocument();
  });
  it('Wordmark reads queer.guide', () => {
    render(<Wordmark />);
    expect(screen.getByText('queer.guide')).toBeInTheDocument();
  });
});
