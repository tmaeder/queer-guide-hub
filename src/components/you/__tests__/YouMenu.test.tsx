/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const savePending = vi.fn().mockResolvedValue(true);
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' }, signOut: vi.fn() }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
vi.mock('@/hooks/useAdminRoles', () => ({
  useAdminRoles: () => ({ isAdmin: false, isModerator: false }),
}));
// The editor has its own specs; here only that the chosen section opens in place.
vi.mock('@/components/profile/ProfileEditor', async () => {
  const { useImperativeHandle } = await import('react');
  function MockEditor({ section, editorRef }: { section: string; editorRef: React.Ref<unknown> }) {
    useImperativeHandle(editorRef, () => ({ savePending }));
    return <div data-testid="editor">{section}</div>;
  }
  return { default: MockEditor };
});

import { YouMenuBody } from '../YouMenu';
import { SETTINGS_GROUPS } from '@/components/profile/settingsNav';

describe('You menu', () => {
  it('opens a settings section in place and Back saves before returning', async () => {
    render(
      <MemoryRouter>
        <YouMenuBody onNavigate={() => {}} editorHeight="" />
      </MemoryRouter>,
    );
    const sections = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(sections.querySelectorAll('button')).toHaveLength(
      SETTINGS_GROUPS.flatMap((g) => g.sections).length,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByTestId('editor')).toHaveTextContent('notifications');
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(savePending).toHaveBeenCalled();
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });
});
