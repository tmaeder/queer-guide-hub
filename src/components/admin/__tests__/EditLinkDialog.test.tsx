/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditLinkDialog } from '../EditLinkDialog';

const baseLink = {
  original_url: 'https://old.example',
  final_url: 'https://new.example',
  status: 'REDIRECT',
  content_type: 'venues',
  field_name: 'website',
} as never;

describe('EditLinkDialog', () => {
  it('renders nothing when no link', () => {
    render(<EditLinkDialog open link={null} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByText(/Edit Link URL/)).toBeNull();
  });

  it('renders original URL + Use this redirect button', () => {
    render(<EditLinkDialog open link={baseLink} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('https://old.example')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use this/ })).toBeInTheDocument();
  });

  it('Use-this redirect copies into the input', () => {
    render(<EditLinkDialog open link={baseLink} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Use this/ }));
    expect(screen.getByDisplayValue('https://new.example')).toBeInTheDocument();
  });

  it('Save fires onSave with new url', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<EditLinkDialog open link={baseLink} onClose={onClose} onSave={onSave} />);
    const input = screen.getByLabelText(/New URL/);
    fireEvent.change(input, { target: { value: 'https://better.example' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('https://better.example'));
  });

  it('shows validation error for malformed URL', async () => {
    const onSave = vi.fn();
    render(<EditLinkDialog open link={baseLink} onClose={vi.fn()} onSave={onSave} />);
    const input = screen.getByLabelText(/New URL/);
    fireEvent.change(input, { target: { value: 'not a url' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(screen.getByText(/Invalid URL format/)).toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });
});
