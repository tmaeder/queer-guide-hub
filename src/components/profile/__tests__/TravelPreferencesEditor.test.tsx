/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useTravelPreferencesEditor', () => ({
  fetchProfileTravelPreferences: vi.fn().mockResolvedValue(null),
  fetchTravelPrefsHomeCity: vi.fn().mockResolvedValue(null),
  saveProfileTravelPreferences: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { TravelPreferencesEditor } from '../TravelPreferencesEditor';

describe('TravelPreferencesEditor', () => {
  it('renders', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<QueryClientProvider client={qc}><TravelPreferencesEditor /></QueryClientProvider>);
    expect(container).toBeTruthy();
  });
});
