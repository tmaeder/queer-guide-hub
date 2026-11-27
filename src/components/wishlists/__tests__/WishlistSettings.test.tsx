import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const update = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useWishlists', () => ({
  updateWishlistSettings: (...a: unknown[]) => update(...a),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { WishlistSettings } from '@/components/wishlists/WishlistSettings';

describe('WishlistSettings', () => {
  beforeEach(() => update.mockClear());
  afterEach(cleanup);
  it('saves a new name and visibility, then reloads', async () => {
    const onSaved = vi.fn();
    render(<WishlistSettings id="w1" title="Saved" visibility="private" onSaved={onSaved} />);
    const save = screen.getByRole('button', { name: /save/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Gifts' } });
    fireEvent.click(screen.getByRole('radio', { name: /anyone with the link/i }));
    fireEvent.click(save);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith('w1', { title: 'Gifts', visibility: 'unlisted' });
  });

  it('does not reload when the update fails', async () => {
    update.mockRejectedValueOnce(new Error('denied'));
    const onSaved = vi.fn();
    render(<WishlistSettings id="w1" title="Saved" visibility="private" onSaved={onSaved} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Other' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
