/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/pages/SubmitForm', () => ({
  default: () => <div data-testid="entity-form">Entity form</div>,
}));

import AddSomethingBranch from '../AddSomethingBranch';

describe('AddSomethingBranch auth boundary', () => {
  it('does not render an entity form for a signed-out deep link', () => {
    render(
      <MemoryRouter>
        <AddSomethingBranch initialType="venue" onBack={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Sign in to contribute')).toBeTruthy();
    expect(screen.queryByTestId('entity-form')).toBeNull();
  });
});
