import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), load: vi.fn(), user: { id: 'member-1' } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, value: string) => value }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      upsert: mocks.upsert,
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.load }) }) }),
    }),
  },
}));
import { VenueRatingForm } from '../VenueRatingForm';
function mount() {
  const onSaved = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <VenueRatingForm venueId="venue-1" onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return onSaved;
}
beforeEach(() => {
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.load.mockReset().mockResolvedValue({ data: null, error: null });
});
describe('venue rating', () => {
  it('persists a zero rating for the signed-in owner without overwriting review text', async () => {
    const onSaved = mount();
    await waitFor(() => expect(screen.getByRole('radio', { name: '0' })).toBeEnabled());
    fireEvent.click(screen.getByRole('radio', { name: '0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save rating' }));
    await screen.findByRole('status');
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ venue_id: 'venue-1', user_id: 'member-1', rating: 0 }),
      { onConflict: 'venue_id,user_id' },
    );
    expect(mocks.upsert.mock.calls[0][0]).not.toHaveProperty('content');
    expect(onSaved).toHaveBeenCalledOnce();
  });
  it('keeps the selection and reports a failed write without claiming success', async () => {
    mocks.upsert.mockResolvedValue({ error: new Error('offline') });
    const onSaved = mount();
    await waitFor(() => expect(screen.getByRole('radio', { name: '5' })).toBeEnabled());
    fireEvent.click(screen.getByRole('radio', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save rating' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');
    expect(screen.getByRole('radio', { name: '5' })).toBeChecked();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
