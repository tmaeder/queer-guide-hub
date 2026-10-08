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
vi.mock('@/components/contribute/FlyerScanBranch', () => ({
  default: () => <div>scan branch</div>,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import { ContributeDialog } from '../ContributeDialog';

describe('ContributeDialog branch routing', () => {
  it.each([
    ['Report a problem or idea', 'feedback branch'],
    ['Fix something on this page', 'correction branch'],
    ['Add something new', 'add branch'],
    ['Scan a flyer or link', 'scan branch'],
  ])('opens %s from the chooser', async (buttonName, branchText) => {
    const user = userEvent.setup();
    render(<ContributeDialog mode="page" />);

    await user.click(screen.getByRole('button', { name: new RegExp(buttonName, 'i') }));
    expect(await screen.findByText(branchText)).toBeTruthy();
  });
});
