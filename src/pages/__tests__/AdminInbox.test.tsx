/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const registerAction = vi.fn();

vi.mock('@/components/admin/triage/TriageView', () => ({
  TriageView: () => <div data-testid="triage-view">[triage]</div>,
}));

vi.mock('@/components/admin/command-palette/useAdminCommandActions', () => ({
  useRegisterAdminCommandAction: (action: { id: string }) => registerAction(action),
}));

import AdminInbox from '../AdminInbox';

describe('AdminInbox', () => {
  it('renders header + embeds TriageView', () => {
    render(
      <MemoryRouter>
        <AdminInbox />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /^Inbox$/i })).toBeTruthy();
    expect(screen.getByTestId('triage-view')).toBeTruthy();
    expect(screen.getByText(/Sorted by priority/i)).toBeTruthy();
  });

  it('registers Open Review Queue + Open Automation Cmd-K actions', () => {
    registerAction.mockReset();
    render(
      <MemoryRouter>
        <AdminInbox />
      </MemoryRouter>,
    );
    const ids = registerAction.mock.calls.map((c) => c[0].id);
    expect(ids).toContain('inbox.review');
    expect(ids).toContain('inbox.automation');
  });

  it('sets the document title', () => {
    render(
      <MemoryRouter>
        <AdminInbox />
      </MemoryRouter>,
    );
    expect(document.title).toMatch(/Inbox.*Admin.*Queer Guide/);
  });
});
