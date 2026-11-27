/** @vitest-environment jsdom */
import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';
import { BottomNavSheet } from '../bottom-nav/BottomNavSheet';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Browse</button>
      <BottomNavSheet open={open} onOpenChange={setOpen} title="Sections">
        <a href="/venues">Places</a>
      </BottomNavSheet>
    </>
  );
}

describe('BottomNavSheet', () => {
  it('restores focus to the controlled opener without a DialogTrigger', async () => {
    renderWithProviders(<Harness />);
    const opener = screen.getByRole('button', { name: 'Browse' });
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
