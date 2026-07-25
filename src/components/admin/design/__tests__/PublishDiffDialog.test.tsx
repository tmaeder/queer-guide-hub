import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublishDiffDialog } from '../PublishDiffDialog';
import type { DesignSettingsController } from '../useDesignSettings';

// Minimal controller stub — only the fields PublishDiffDialog reads.
function makeController(over: Partial<DesignSettingsController> = {}): DesignSettingsController {
  const mutateAsync = vi.fn().mockResolvedValue(undefined);
  return {
    draft: {},
    hasErrors: false,
    validationErrors: {},
    row: { published: {}, draft: {}, published_version: 1, overrides_enabled: true, updated_at: '' },
    publish: { mutateAsync, isPending: false },
    ...over,
  } as unknown as DesignSettingsController;
}

describe('PublishDiffDialog contrast gate', () => {
  it('blocks publish for a sub-3:1 draft pair until acknowledged', () => {
    // foreground == background → 1:1, fails even large-text.
    const controller = makeController({
      draft: { tokens: { light: { foreground: '0 0% 100%' }, dark: { foreground: '0 0% 4%' } } },
    });
    render(<PublishDiffDialog controller={controller} open onOpenChange={() => {}} />);

    const publishBtn = screen.getByRole('button', { name: /^publish$/i });
    expect(publishBtn).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/publish anyway/i));
    expect(publishBtn).not.toBeDisabled();

    fireEvent.click(publishBtn);
    expect((controller.publish as unknown as { mutateAsync: ReturnType<typeof vi.fn> }).mutateAsync)
      .toHaveBeenCalledTimes(1);
  });

  it('disables publish when the draft equals published (no changes)', () => {
    const controller = makeController({ draft: {} });
    render(<PublishDiffDialog controller={controller} open onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeDisabled();
  });

  it('disables publish when the draft has validation errors', () => {
    const controller = makeController({
      draft: { tokens: { light: { muted: '0 0% 50%' } } },
      hasErrors: true,
      validationErrors: { 'tokens.light.background': 'bad' },
    });
    render(<PublishDiffDialog controller={controller} open onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeDisabled();
  });
});
