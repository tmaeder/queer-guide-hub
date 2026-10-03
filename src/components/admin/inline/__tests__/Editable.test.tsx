import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const useAdminEditModeMock = vi.fn();
vi.mock('@/hooks/useAdminEditMode', () => ({
  useAdminEditMode: () => useAdminEditModeMock(),
  AdminEditModeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const saveMock = vi.fn();
vi.mock('@/hooks/useInlineSave', () => ({
  useInlineSave: () => ({ save: saveMock, saving: false }),
}));

import { Editable } from '../Editable';

describe('Editable', () => {
  beforeEach(() => {
    useAdminEditModeMock.mockReset();
    saveMock.mockReset();
  });

  it('renders children unchanged when user is not admin', () => {
    useAdminEditModeMock.mockReturnValue({
      isAdmin: false,
      altHeld: false,
      pinned: false,
      editMode: false,
    });
    render(
      <Editable contentType="venues" recordId="v1" field="name" value="Hello">
        <span>Hello</span>
      </Editable>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    // No editor wrapper attribute on the rendered child
    expect(document.querySelector('[data-editable-field]')).toBeNull();
  });

  it('does NOT activate on plain click (admin, but no Alt)', async () => {
    useAdminEditModeMock.mockReturnValue({
      isAdmin: true,
      altHeld: false,
      pinned: false,
      editMode: false,
    });
    render(
      <Editable contentType="venues" recordId="v1" field="name" value="Hello">
        <span>Hello</span>
      </Editable>,
    );
    fireEvent.click(screen.getByText('Hello'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('activates editor on Alt-click for admin', async () => {
    useAdminEditModeMock.mockReturnValue({
      isAdmin: true,
      altHeld: true,
      pinned: false,
      editMode: true,
    });
    render(
      <Editable contentType="venues" recordId="v1" field="name" value="Hello">
        <span>Hello</span>
      </Editable>,
    );
    // Dispatch a click with altKey true
    fireEvent.click(screen.getByText('Hello'), { altKey: true });
    const input = await screen.findByRole('textbox', { name: 'Name' });
    expect((input as HTMLInputElement).value).toBe('Hello');
  });

  it('Esc cancels editing', async () => {
    useAdminEditModeMock.mockReturnValue({
      isAdmin: true,
      altHeld: true,
      pinned: false,
      editMode: true,
    });
    render(
      <Editable contentType="venues" recordId="v1" field="name" value="Hello">
        <span>Hello</span>
      </Editable>,
    );
    fireEvent.click(screen.getByText('Hello'), { altKey: true });
    const input = await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull();
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('Enter triggers save', async () => {
    saveMock.mockResolvedValue({ success: true });
    useAdminEditModeMock.mockReturnValue({
      isAdmin: true,
      altHeld: true,
      pinned: false,
      editMode: true,
    });
    render(
      <Editable contentType="venues" recordId="v1" field="name" value="Hello">
        <span>Hello</span>
      </Editable>,
    );
    fireEvent.click(screen.getByText('Hello'), { altKey: true });
    const input = await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Goodbye' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ value: 'Goodbye' }));
    });
  });

  it('keeps a failed save visible in the active cell', async () => {
    saveMock.mockResolvedValue({ success: false, error: 'Name is required' });
    useAdminEditModeMock.mockReturnValue({
      isAdmin: true,
      altHeld: false,
      pinned: false,
      editMode: false,
    });
    render(
      <Editable
        contentType="venues"
        recordId="v1"
        field="name"
        value="Hello"
        requireAltClick={false}
      >
        <span>Hello</span>
      </Editable>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit Name' }));
    const input = await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required');
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });

  // The pin is the discoverable equivalent of holding Alt: inline editing used
  // to be reachable ONLY by a key nothing on the page advertised.
  it('activates on a PLAIN click when edit mode is pinned on', async () => {
    useAdminEditModeMock.mockReturnValue({
      isAdmin: true,
      altHeld: false,
      pinned: true,
      editMode: true,
    });
    render(
      <Editable contentType="venues" recordId="v1" field="name" value="Hello">
        <span>Hello</span>
      </Editable>,
    );
    fireEvent.click(screen.getByText('Hello'));
    const input = await screen.findByRole('textbox', { name: 'Name' });
    expect((input as HTMLInputElement).value).toBe('Hello');
  });

  it('still honours Alt-click while the pin is off', async () => {
    useAdminEditModeMock.mockReturnValue({
      isAdmin: true,
      altHeld: true,
      pinned: false,
      editMode: true,
    });
    render(
      <Editable contentType="venues" recordId="v1" field="name" value="Hello">
        <span>Hello</span>
      </Editable>,
    );
    fireEvent.click(screen.getByText('Hello'), { altKey: true });
    expect(await screen.findByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });

  it('shows a quiet, keyboard-focusable edit affordance whenever edit mode is on', () => {
    useAdminEditModeMock.mockReturnValue({
      isAdmin: true,
      altHeld: false,
      pinned: true,
      editMode: true,
    });
    render(
      <Editable contentType="venues" recordId="v1" field="name" value="Hello">
        <span>Hello</span>
      </Editable>,
    );
    const editable = screen.getByRole('button', { name: 'Edit Name' });
    expect(editable.className).toContain('hover:bg-surface-container-high');
    expect(editable.className).toContain('min-h-11');
    expect(editable.className).toContain('sm:min-h-8');
    expect(editable.className).not.toContain('outline-dashed');
    expect(editable).toHaveAttribute('tabindex', '0');
    expect(editable.querySelector('svg')).toBeTruthy();
  });

  it('opens an admin-table editor with Enter or Space', async () => {
    useAdminEditModeMock.mockReturnValue({
      isAdmin: true,
      altHeld: false,
      pinned: false,
      editMode: false,
    });
    const { unmount } = render(
      <Editable
        contentType="venues"
        recordId="v1"
        field="name"
        value="Hello"
        requireAltClick={false}
      >
        <span>Hello</span>
      </Editable>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Name' }), { key: 'Enter' });
    expect(await screen.findByRole('textbox', { name: 'Name' })).toBeInTheDocument();

    unmount();
    render(
      <Editable
        contentType="venues"
        recordId="v1"
        field="name"
        value="Hello"
        requireAltClick={false}
      >
        <span>Hello</span>
      </Editable>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Name' }), { key: ' ' });
    expect(await screen.findByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });

  it('draws no affordance and ignores a plain click when edit mode is off', () => {
    useAdminEditModeMock.mockReturnValue({
      isAdmin: true,
      altHeld: false,
      pinned: false,
      editMode: false,
    });
    render(
      <Editable contentType="venues" recordId="v1" field="name" value="Hello">
        <span>Hello</span>
      </Editable>,
    );
    const el = document.querySelector('[data-editable-field="name"]');
    expect(el?.className).not.toContain('outline-dashed');
    fireEvent.click(screen.getByText('Hello'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
