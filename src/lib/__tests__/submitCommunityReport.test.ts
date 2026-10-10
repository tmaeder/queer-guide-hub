/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

import { submitCommunityReport } from '../submitCommunityReport';

describe('submitCommunityReport', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: { id: 'report-1', screenshotStored: true },
      error: null,
    });
  });

  it('sends a captured screenshot through the narrow report endpoint', async () => {
    await submitCommunityReport({
      kind: 'feedback',
      payload: { category: 'bug', title: 'Broken', description: 'The page is broken.' },
      context: { url: 'https://queer.guide/map' },
      screenshotBlob: new Blob(['screenshot-bytes'], { type: 'image/jpeg' }),
    });

    expect(invoke).toHaveBeenCalledWith(
      'submit-community-report',
      expect.objectContaining({
        body: expect.objectContaining({
          kind: 'feedback',
          screenshot: expect.objectContaining({
            contentType: 'image/jpeg',
            base64: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('does not encode or send a screenshot after opt-out', async () => {
    await submitCommunityReport({
      kind: 'correction',
      payload: { title: 'Correction' },
      context: {},
      screenshotBlob: new Blob(['screenshot-bytes'], { type: 'image/jpeg' }),
      includeScreenshot: false,
    });

    expect(invoke.mock.calls[0][1].body.screenshot).toBeNull();
  });
});
