/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/contribute/FeedbackForm', () => ({
  default: () => <div>feedback branch</div>,
}));
vi.mock('@/components/contribute/CorrectionForm', () => ({
  default: () => <div>correction branch</div>,
}));
vi.mock('@/components/contribute/AddSomethingBranch', () => ({
  default: () => <div>add branch</div>,
}));
vi.mock('@/components/contribute/ContactBranch', () => ({
  default: () => <div>contact branch</div>,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import { ContributeDialog } from '../ContributeDialog';

describe('ContributeDialog branch routing', () => {
  it.each([
    ['Report a problem or idea', 'feedback branch'],
    ['Fix something on this page', 'correction branch'],
    ['Add something new', 'add branch'],
    ['Contact the team', 'contact branch'],
  ])('opens %s from the chooser', async (buttonName, branchText) => {
    const user = userEvent.setup();
    render(<ContributeDialog mode="page" />);

    await user.click(screen.getByRole('button', { name: new RegExp(buttonName, 'i') }));
    expect(await screen.findByText(branchText)).toBeTruthy();
  });

  it('keeps flyer scanning out of the root chooser', () => {
    render(<ContributeDialog mode="page" />);
    expect(screen.queryByRole('button', { name: /Scan a flyer or link/i })).toBeNull();
  });

  it('opens the contact branch directly for the durable /contact wrapper', async () => {
    render(<ContributeDialog mode="page" initialBranch="contact" />);
    expect(await screen.findByText('contact branch')).toBeTruthy();
  });
});
