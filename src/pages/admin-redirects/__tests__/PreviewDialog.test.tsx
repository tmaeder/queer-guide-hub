/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../types', () => ({ SUPABASE_URL: 'https://sb.example' }));

import { PreviewDialog } from '../PreviewDialog';

describe('PreviewDialog', () => {
  it('renders nothing when closed', () => {
    render(<PreviewDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByText(/Preview/i)).toBeNull();
  });

  it('shows preview URL after typing slug + clicking Test', () => {
    render(<PreviewDialog open onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/pride-zrh/i), { target: { value: 'foo' } });
    fireEvent.click(screen.getByRole('button', { name: /Test/i }));
    expect(screen.getByText(/redirect-handler\?slug=foo/)).toBeInTheDocument();
  });

  it('extracts slug from /go/ URL', () => {
    render(<PreviewDialog open onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/pride-zrh/i), {
      target: { value: 'https://queer.guide/go/bar?utm=x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Test/i }));
    expect(screen.getByText(/slug=bar/)).toBeInTheDocument();
  });

  it('shows error when empty slug', () => {
    render(<PreviewDialog open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Test/i }));
    expect(screen.getAllByText(/Enter a slug/).length).toBeGreaterThan(0);
  });

  it('Close calls onClose', () => {
    const onClose = vi.fn();
    render(<PreviewDialog open onClose={onClose} />);
    const closeBtns = screen.getAllByRole('button', { name: /^Close$/ });
    fireEvent.click(closeBtns[closeBtns.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });
});
