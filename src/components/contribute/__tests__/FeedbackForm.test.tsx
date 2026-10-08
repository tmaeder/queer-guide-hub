/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertRow = vi.hoisted(() => vi.fn());
const uploadImageToR2 = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/usePageFetchers', () => ({ insertRow }));
vi.mock('@/lib/uploadImageToR2', () => ({ uploadImageToR2 }));
vi.mock('@/utils/feedbackContext', () => ({ captureContext: () => ({ page_url: location.href }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import FeedbackForm from '../FeedbackForm';

describe('FeedbackForm anonymous submission', () => {
  beforeEach(() => {
    insertRow.mockReset();
    insertRow.mockResolvedValue({ error: null });
    uploadImageToR2.mockReset();
  });

  it('keeps feedback anonymous and does not promise an unavailable screenshot upload', async () => {
    const user = userEvent.setup();
    render(<FeedbackForm screenshotBlob={new Blob(['image'])} />);

    expect(screen.queryByLabelText(/Include screenshot/i)).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Bug' }));
    await user.type(screen.getByLabelText(/^Title/i), 'Broken map');
    await user.type(screen.getByLabelText(/^Description/i), 'The map does not load.');
    await user.type(screen.getByLabelText(/Email/i), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));

    expect(uploadImageToR2).not.toHaveBeenCalled();
    expect(insertRow).toHaveBeenCalledWith(
      'community_submissions',
      expect.objectContaining({
        content_type: 'feedback',
        submitted_by: null,
        data: expect.objectContaining({
          title: 'Broken map',
          description: 'The map does not load.',
          contact_email: 'reader@example.com',
          screenshot_url: null,
        }),
      }),
    );
  });
});
