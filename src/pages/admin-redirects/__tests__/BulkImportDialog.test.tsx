/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BulkImportDialog } from '../BulkImportDialog';

describe('BulkImportDialog', () => {
  it('renders nothing when closed', () => {
    render(<BulkImportDialog open={false} onClose={vi.fn()} onImport={vi.fn()} />);
    expect(screen.queryByText(/Bulk Import/i)).toBeNull();
  });

  it('renders form when open + Import disabled with empty textarea', () => {
    render(<BulkImportDialog open onClose={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^Import$/ })).toBeDisabled();
  });

  it('Close fires onClose', () => {
    const onClose = vi.fn();
    render(<BulkImportDialog open onClose={onClose} onImport={vi.fn()} />);
    const closeBtns = screen.getAllByRole('button', { name: /^Close$/ });
    fireEvent.click(closeBtns[closeBtns.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it('parses CSV and invokes onImport', async () => {
    const onImport = vi.fn().mockResolvedValue({ success: 2, errors: [] });
    render(<BulkImportDialog open onClose={vi.fn()} onImport={onImport} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'slug,target\nfoo,/foo\nbar,/bar' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(onImport).toHaveBeenCalledWith([
      { slug: 'foo', target: '/foo' },
      { slug: 'bar', target: '/bar' },
    ]);
    await waitFor(() => expect(screen.getByText(/Imported 2 redirect/)).toBeInTheDocument());
  });

  it('shows error when only header row provided', async () => {
    render(<BulkImportDialog open onClose={vi.fn()} onImport={vi.fn().mockResolvedValue({ success: 0, errors: [] })} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'slug,target' } });
    fireEvent.click(screen.getByRole('button', { name: /^Import$/ }));
    await waitFor(() => expect(screen.getByText(/Need at least a header/)).toBeInTheDocument());
  });
});
