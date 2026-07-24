/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const registerAction = vi.fn();

vi.mock('@/components/admin/triage/TriageView', () => ({
  TriageView: (p: { initialQueueType?: string }) => (
    <div data-testid="triage-view">{p.initialQueueType ?? 'none'}</div>
  ),
}));

vi.mock('@/components/admin/command-palette/useAdminCommandActions', () => ({
  useRegisterAdminCommandAction: (action: { id: string }) => registerAction(action),
}));

import AdminInbox from '../AdminInbox';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/inbox" element={<AdminInbox />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminInbox', () => {
  it('renders header + embeds TriageView without a queue by default', () => {
    renderAt('/admin/inbox');
    expect(screen.getByRole('heading', { name: /^Inbox$/i })).toBeTruthy();
    expect(screen.getByTestId('triage-view')).toHaveTextContent('none');
    expect(screen.getByText(/Sorted by priority/i)).toBeTruthy();
  });

  it('maps legacy ?tab=staging (from /admin/review deep links) to the staging queue', () => {
    renderAt('/admin/inbox?tab=staging');
    expect(screen.getByTestId('triage-view')).toHaveTextContent('staging');
  });

  it('queue param overrides tab', () => {
    renderAt('/admin/inbox?tab=staging&queue=duplicates');
    expect(screen.getByTestId('triage-view')).toHaveTextContent('duplicates');
  });

  it('registers the Open Automation Cmd-K action', () => {
    registerAction.mockReset();
    renderAt('/admin/inbox');
    const ids = registerAction.mock.calls.map((c) => c[0].id);
    expect(ids).toContain('inbox.automation');
  });

  it('sets the document title', () => {
    renderAt('/admin/inbox');
    expect(document.title).toMatch(/Inbox.*Admin.*Queer Guide/);
  });
});
