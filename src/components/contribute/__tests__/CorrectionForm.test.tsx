/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageEntityProvider, usePageEntity } from '@/contexts/PageEntityContext';

const submitCommunityReport = vi.hoisted(() => vi.fn());
vi.mock('@/lib/submitCommunityReport', () => ({ submitCommunityReport }));
vi.mock('@/utils/feedbackContext', () => ({ captureContext: () => ({ viewport: 'test' }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import CorrectionForm from '../CorrectionForm';

function EntityPublisher() {
  usePageEntity({ contentType: 'venues', contentId: 'venue-1', contentName: 'Example Bar' });
  return null;
}

describe('CorrectionForm', () => {
  beforeEach(() => {
    submitCommunityReport.mockReset();
    submitCommunityReport.mockResolvedValue({ id: 'correction-1', screenshotStored: true });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:screenshot'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    window.history.replaceState({}, '', '/venues/example-bar');
  });

  it('writes an anonymous correction with page and entity context', async () => {
    const user = userEvent.setup();
    render(
      <PageEntityProvider>
        <EntityPublisher />
        <CorrectionForm screenshotBlob={new Blob(['image'])} />
      </PageEntityProvider>,
    );

    expect(screen.getByLabelText(/Include screenshot/i)).toBeChecked();
    await user.type(screen.getByLabelText(/What is wrong/i), 'The address is outdated.');
    await user.type(screen.getByLabelText(/What should it say instead/i), 'Use 12 New Street.');
    await user.type(screen.getByLabelText(/Email/i), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));

    expect(submitCommunityReport).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'correction',
        includeScreenshot: true,
        context: { viewport: 'test' },
        payload: expect.objectContaining({
          description: 'The address is outdated.',
          proposed_correction: 'Use 12 New Street.',
          contact_email: 'reader@example.com',
          entity: {
            content_type: 'venues',
            content_id: 'venue-1',
            content_name: 'Example Bar',
          },
        }),
      }),
    );
  });
});
