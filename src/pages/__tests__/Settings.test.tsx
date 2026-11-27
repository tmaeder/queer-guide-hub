/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  savePending: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => useNavigate() }));
vi.mock('@/components/profile/ProfileEditor', async () => {
  const { useImperativeHandle } = await import('react');
  return {
    default: function FakeEditor({
      section,
      editorRef,
    }: {
      section: string;
      editorRef: React.Ref<unknown>;
    }) {
      useImperativeHandle(editorRef, () => ({ savePending: state.savePending }));
      return <div data-testid="editor">{section}</div>;
    },
  };
});

import Settings from '../Settings';
import { SETTINGS_SECTIONS } from '@/lib/profileEditing';

function Probe() {
  const { pathname, search } = useLocation();
  return (
    <output data-testid="location">
      {pathname}
      {search}
    </output>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/privacy" element={<Settings section="privacy" />} />
        <Route path="/settings/:section" element={<Settings />} />
        <Route path="*" element={<div>ELSEWHERE</div>} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

describe('settings page', () => {
  beforeEach(() => {
    state.user = { id: 'u1' };
    state.savePending.mockReset().mockResolvedValue(true);
  });

  it('lists every section and opens the requested one', async () => {
    renderAt('/settings/notifications');
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    // One link per section, in SETTINGS_SECTIONS order.
    expect([...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(
      SETTINGS_SECTIONS.map((s) => `/settings/${s}`),
    );
    expect(screen.getByRole('link', { name: /Notifications/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await screen.findByTestId('editor')).toHaveTextContent('notifications');
  });

  it('opens profile by default on desktop', async () => {
    renderAt('/settings');
    expect(await screen.findByTestId('editor')).toHaveTextContent('profile');
  });

  it('accepts a section from a literal route', async () => {
    renderAt('/settings/privacy');
    expect(await screen.findByTestId('editor')).toHaveTextContent('privacy');
  });

  it('saves pending edits before switching section', async () => {
    renderAt('/settings/profile');
    await screen.findByTestId('editor');
    fireEvent.click(screen.getByRole('link', { name: /Travel/ }));
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/settings/travel'),
    );
    expect(state.savePending).toHaveBeenCalledTimes(1);
  });

  it('stays on the section when the pending save fails', async () => {
    state.savePending.mockResolvedValue(false);
    renderAt('/settings/profile');
    await screen.findByTestId('editor');
    fireEvent.click(screen.getByRole('link', { name: /Travel/ }));
    await waitFor(() => expect(state.savePending).toHaveBeenCalled());
    expect(screen.getByTestId('location').textContent).toBe('/settings/profile');
  });

  it.each([
    ['/settings?section=account', '/settings/security'],
    ['/settings?tab=dating', '/settings/dating'],
    ['/settings/account', '/settings/security'],
  ])('maps the legacy %s link to %s', async (source, target) => {
    renderAt(source);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(target));
  });

  it('sends signed-out visitors to sign in and back', async () => {
    state.user = null;
    renderAt('/settings/privacy');
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/auth?redirect=%2Fsettings%2Fprivacy',
      ),
    );
  });
});
