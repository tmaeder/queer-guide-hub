/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AdminCommandActionsProvider,
  useAdminCommandActions,
  useRegisterAdminCommandAction,
} from '../useAdminCommandActions';

// Reproduces the infinite-loop regression (React #185, "Maximum update depth
// exceeded"): callers pass a fresh inline object every render. If the register
// effect depends on the object identity, it re-fires forever. These tests render
// inside the real provider so a regression would throw during render.

function InlineCaller({ onPerform }: { onPerform: () => void }) {
  useRegisterAdminCommandAction({
    id: 'test.action',
    label: 'Test Action',
    keywords: 'reload',
    shortcut: '⌘R',
    perform: onPerform,
  });
  return <span>caller</span>;
}

function ActionCount() {
  const { actions } = useAdminCommandActions();
  return <output data-testid="count">{actions.length}</output>;
}

describe('useRegisterAdminCommandAction', () => {
  it('registers an inline action without an infinite update loop', () => {
    render(
      <AdminCommandActionsProvider>
        <InlineCaller onPerform={() => {}} />
        <ActionCount />
      </AdminCommandActionsProvider>,
    );
    expect(screen.getByText('caller')).toBeTruthy();
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('calls the latest perform closure through the ref', () => {
    const perform = vi.fn();

    function Runner() {
      const { actions } = useAdminCommandActions();
      return (
        <button type="button" onClick={() => actions[0]?.perform()}>
          run
        </button>
      );
    }

    render(
      <AdminCommandActionsProvider>
        <InlineCaller onPerform={perform} />
        <Runner />
      </AdminCommandActionsProvider>,
    );

    screen.getByText('run').click();
    expect(perform).toHaveBeenCalledTimes(1);
  });
});
