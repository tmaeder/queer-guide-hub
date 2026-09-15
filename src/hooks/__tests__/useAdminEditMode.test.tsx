/**
 * @vitest-environment jsdom
 *
 * Inline editing was reachable ONLY by holding Alt — a key nothing on the page
 * advertised, so the feature was effectively invisible. The pin makes it a
 * visible toggle; Alt-hold is kept unchanged as the fast path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

const useAdminRolesMock = vi.fn();
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => useAdminRolesMock() }));

import { AdminEditModeProvider, useAdminEditMode } from '../useAdminEditMode';

function Probe() {
  const { isAdmin, altHeld, pinned, editMode, setPinned } = useAdminEditMode();
  return (
    <div>
      <span data-testid="state">{JSON.stringify({ isAdmin, altHeld, pinned, editMode })}</span>
      <button onClick={() => setPinned(true)}>pin</button>
      <button onClick={() => setPinned(false)}>unpin</button>
    </div>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}');

const renderProbe = () =>
  render(
    <AdminEditModeProvider>
      <Probe />
    </AdminEditModeProvider>,
  );

beforeEach(() => {
  useAdminRolesMock.mockReset();
  sessionStorage.clear();
  useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
});

describe('useAdminEditMode', () => {
  it('is off by default', () => {
    renderProbe();
    expect(state()).toMatchObject({ isAdmin: true, pinned: false, editMode: false });
  });

  it('Alt-hold turns edit mode on and releasing turns it off', () => {
    renderProbe();
    act(() => {
      fireEvent.keyDown(window, { key: 'Alt' });
    });
    expect(state()).toMatchObject({ altHeld: true, editMode: true });
    act(() => {
      fireEvent.keyUp(window, { key: 'Alt' });
    });
    expect(state()).toMatchObject({ altHeld: false, editMode: false });
  });

  it('window blur clears a stuck Alt', () => {
    renderProbe();
    act(() => {
      fireEvent.keyDown(window, { key: 'Alt' });
    });
    act(() => {
      fireEvent.blur(window);
    });
    expect(state()).toMatchObject({ altHeld: false, editMode: false });
  });

  it('the pin turns edit mode on without Alt, and persists', () => {
    renderProbe();
    act(() => {
      screen.getByText('pin').click();
    });
    expect(state()).toMatchObject({ pinned: true, altHeld: false, editMode: true });
    expect(sessionStorage.getItem('admin-inline-edit-pinned')).toBe('1');
  });

  it('restores the pin for a returning admin in the same session', () => {
    sessionStorage.setItem('admin-inline-edit-pinned', '1');
    renderProbe();
    expect(state()).toMatchObject({ pinned: true, editMode: true });
  });

  it('unpinning clears the stored value', () => {
    sessionStorage.setItem('admin-inline-edit-pinned', '1');
    renderProbe();
    act(() => {
      screen.getByText('unpin').click();
    });
    expect(state()).toMatchObject({ pinned: false, editMode: false });
    expect(sessionStorage.getItem('admin-inline-edit-pinned')).toBeNull();
  });

  it('a NON-admin is never in edit mode, whatever sessionStorage says', () => {
    // The pin is a convenience. The role is the gate, and a leftover key from
    // a previous admin session on a shared browser must not re-arm it.
    sessionStorage.setItem('admin-inline-edit-pinned', '1');
    useAdminRolesMock.mockReturnValue({ canManageContent: () => false, loading: false });
    renderProbe();
    expect(state()).toMatchObject({ isAdmin: false, pinned: false, editMode: false });
  });

  it('a non-admin gets no Alt handling either', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => false, loading: false });
    renderProbe();
    act(() => {
      fireEvent.keyDown(window, { key: 'Alt' });
    });
    expect(state()).toMatchObject({ altHeld: false, editMode: false });
  });

  it('drops edit mode the moment the role goes away, with the pin still set', () => {
    // Reachable in production: useAdminRoles re-runs on Supabase
    // TOKEN_REFRESHED identity churn, and a role can be revoked mid-session.
    // The mount-time restore guard cannot cover this — `pinned` is already
    // true in state by then, so the gate has to be re-applied on every read.
    const { rerender } = renderProbe();
    act(() => {
      screen.getByText('pin').click();
    });
    expect(state()).toMatchObject({ pinned: true, editMode: true });

    useAdminRolesMock.mockReturnValue({ canManageContent: () => false, loading: false });
    rerender(
      <AdminEditModeProvider>
        <Probe />
      </AdminEditModeProvider>,
    );
    expect(state()).toMatchObject({ isAdmin: false, pinned: false, editMode: false });
  });

  it('is off while the role is still loading', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: true });
    renderProbe();
    expect(state()).toMatchObject({ isAdmin: false, editMode: false });
  });
});
