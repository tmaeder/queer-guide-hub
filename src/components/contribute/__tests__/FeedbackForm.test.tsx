/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

const submitCommunityReport = vi.hoisted(() => vi.fn());
vi.mock('@/lib/submitCommunityReport', () => ({ submitCommunityReport }));
vi.mock('@/utils/feedbackContext', () => ({ captureContext: () => ({ page_url: location.href }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import FeedbackForm from '../FeedbackForm';

describe('FeedbackForm anonymous submission', () => {
  beforeEach(() => {
    submitCommunityReport.mockReset();
    submitCommunityReport.mockResolvedValue({ id: 'report-1', screenshotStored: true });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:screenshot'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('includes an automatically captured screenshot for anonymous feedback by default', async () => {
    const user = userEvent.setup();
    render(<FeedbackForm screenshotBlob={new Blob(['image'])} />);

    expect(screen.getByLabelText(/Include screenshot/i)).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Bug reports' }));
    await user.type(screen.getByLabelText(/^Title/i), 'Broken map');
    await user.type(screen.getByLabelText(/^Description/i), 'The map does not load.');
    await user.type(screen.getByLabelText(/Email/i), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));

    expect(submitCommunityReport).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'feedback',
        includeScreenshot: true,
        screenshotBlob: expect.any(Blob),
        context: { page_url: location.href },
        payload: expect.objectContaining({
          title: 'Broken map',
          description: 'The map does not load.',
          contact_email: 'reader@example.com',
        }),
      }),
    );
  });

  it('allows the reporter to opt out of the default screenshot', async () => {
    const user = userEvent.setup();
    render(<FeedbackForm screenshotBlob={new Blob(['image'])} />);
    await user.click(screen.getByLabelText(/Include screenshot/i));
    await user.click(screen.getByRole('radio', { name: 'Idea' }));
    await user.type(screen.getByLabelText(/^Title/i), 'A useful idea');
    await user.type(screen.getByLabelText(/^Description/i), 'Please add this useful feature.');
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));
    expect(submitCommunityReport).toHaveBeenCalledWith(
      expect.objectContaining({ includeScreenshot: false }),
    );
  });

  it('preselects the safety category and keeps crisis guidance there', () => {
    window.history.replaceState({}, '', '/submit/feedback?category=safety');
    render(
      <MemoryRouter>
        <FeedbackForm />
      </MemoryRouter>,
    );
    expect(screen.getByRole('radio', { name: /Safety and moderation/i })).toBeChecked();
    expect(screen.getByRole('link', { name: /Crisis lines by country/i })).toBeTruthy();
  });
});
