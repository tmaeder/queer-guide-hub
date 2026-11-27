import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { CopyableSnippet } from '../copyable-snippet';

const LABELS = { copyLabel: 'Copy', copiedLabel: 'Copied', failedMessage: 'Not copied' };
const TEXT = 'Queer Guide. (2026). LGBTQ+ equality score: methodology.';

function stubClipboard(writeText: (() => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

afterEach(() => {
  stubClipboard(undefined);
  window.getSelection()?.removeAllRanges();
});

describe('CopyableSnippet', () => {
  it('confirms a successful copy', async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    renderWithProviders(<CopyableSnippet label="APA" text={TEXT} {...LABELS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy APA' }));
    await screen.findByRole('button', { name: 'Copied APA' });
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['rejects', () => Promise.reject(new Error('denied'))],
    ['is missing', undefined],
  ] as const)('says so and selects the text when the clipboard %s', async (_case, writeText) => {
    stubClipboard(writeText as (() => Promise<void>) | undefined);
    renderWithProviders(<CopyableSnippet label="APA" text={TEXT} {...LABELS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy APA' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Not copied');
    await waitFor(() => expect(window.getSelection()?.toString()).toBe(TEXT));
    expect(screen.getByRole('button', { name: 'Copy APA' })).toBeTruthy();
  });
});
