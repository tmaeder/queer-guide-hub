/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../badge';

describe('Badge', () => {
  it('renders text', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
  });
  it('applies variant', () => {
    const { container } = render(<Badge variant="destructive">X</Badge>);
    expect(container.firstChild).toHaveClass('bg-destructive');
  });
});
