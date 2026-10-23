import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NewsSavedSearchesPanel } from '../NewsSavedSearchesPanel';
const mocks = vi.hoisted(() => ({ save: vi.fn(), toggleAlert: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'fixture-owner' } }) }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useNewsSavedSearches', () => ({
  useNewsSavedSearches: () => ({
    searches: [],
    save: mocks.save,
    isSaving: false,
    remove: vi.fn(),
    toggleAlert: mocks.toggleAlert,
  }),
}));
beforeEach(() => {
  mocks.save.mockReset().mockResolvedValue(undefined);
});
it('explains unavailable delivery while preserving saved search and future alert preferences', async () => {
  render(<NewsSavedSearchesPanel currentQuery="community" currentFilters={{ language: 'de' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Saved searches' }));
  expect(
    await screen.findByText(/Email delivery for saved searches is unavailable/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save this search' }));
  fireEvent.change(screen.getByPlaceholderText('Name this search…'), {
    target: { value: 'My community search' },
  });
  const preference = screen.getByRole('switch', { name: /Save email alert preference/ });
  expect(preference).toHaveAccessibleDescription(/unavailable/);
  fireEvent.click(preference);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      name: 'My community search',
      query: 'community',
      filters: { language: 'de' },
      alert_enabled: true,
      alert_frequency: 'daily',
    }),
  );
});
