/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const captureScreenshot = vi.hoisted(() => vi.fn());
const dialogProps = vi.hoisted(() => vi.fn());
vi.mock('@/utils/feedbackContext', () => ({ captureScreenshot }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/contribute/ContributeDialog', () => ({
  ContributeDialog: (props: unknown) => {
    dialogProps(props);
    return null;
  },
}));

import { FeedbackButton } from '../FeedbackButton';

describe('FeedbackButton anonymous screenshot capture', () => {
  beforeEach(() => {
    dialogProps.mockClear();
    captureScreenshot.mockReset();
    captureScreenshot.mockResolvedValue(new Blob(['captured'], { type: 'image/jpeg' }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('captures the underlying page before opening for a signed-out visitor', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <FeedbackButton />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole('button', { name: /Contribute to Queer Guide/i }));

    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(dialogProps).toHaveBeenLastCalledWith(
        expect.objectContaining({ open: true, screenshotBlob: expect.any(Blob) }),
      ),
    );
  });
});
