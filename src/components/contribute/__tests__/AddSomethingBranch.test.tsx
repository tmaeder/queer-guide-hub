/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/pages/SubmitForm', () => ({
  default: () => <div data-testid="entity-form">Entity form</div>,
}));
vi.mock('@/components/contribute/FlyerScanBranch', () => ({
  default: () => <div>scan branch</div>,
}));

import AddSomethingBranch from '../AddSomethingBranch';

describe('AddSomethingBranch auth boundary', () => {
  it('does not render an entity form for a signed-out deep link', () => {
    auth.user = null;
    render(
      <MemoryRouter>
        <AddSomethingBranch initialType="venue" onBack={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Sign in to contribute')).toBeTruthy();
    expect(screen.queryByTestId('entity-form')).toBeNull();
  });

  it('nests flyer scanning inside the signed-in add branch', async () => {
    auth.user = { id: 'user-1' };
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddSomethingBranch onBack={vi.fn()} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Scan a flyer or link/i }));
    expect(await screen.findByText('scan branch')).toBeTruthy();
  });
});
