import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CONSENT_STORAGE_KEY } from '@/lib/analyticsConsent';
import { useTravelMeet } from '../useTravelMeet';

const mocks = vi.hoisted(() => ({
  user: { id: 'traveller' } as { id: string } | null,
  rpc: vi.fn(),
  insert: vi.fn(),
  umami: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/integrations/supabase/untyped', () => ({ untypedRpc: mocks.rpc }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/telemetryInsert', () => ({ insertTelemetry: mocks.insert }));
vi.mock('@/utils/consentedAnalytics', () => ({ trackConsentedEvent: mocks.umami }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string) => fallback }),
}));

const context = {
  cityId: 'city',
  start: '2099-06-01',
  end: '2099-06-02',
  activity: '',
  tripId: '',
  eventId: '',
} as const;
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTravelMeet(context), { wrapper });
}
function consent(value: boolean) {
  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({ version: '1.0', preferences: { analytics: value } }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  consent(true);
  Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'webdriver', { configurable: true, value: undefined });
  mocks.user = { id: 'traveller' };
  mocks.insert.mockResolvedValue(true);
  mocks.rpc.mockImplementation(async (name: string) => ({
    data:
      name === 'travel_meet_list'
        ? { allowed: true, plans: [], own_plans: [], alert_id: null }
        : { id: 'request-reference' },
    error: null,
  }));
});
describe('travel funnel tracking', () => {
  it('records one eligible empty-results browse across rerenders and polling', async () => {
    const hook = mount();
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    hook.rerender();
    await act(async () => {
      await hook.result.current.refetch();
    });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0]).toEqual([
      'user_events',
      expect.objectContaining({
        user_id: 'traveller',
        event_type: 'travel_meet_browse',
        entity_id: null,
        metadata: { surface: 'meet_travel' },
      }),
    ]);
  });
  it.each(['no consent', 'DNT', 'automation', 'anonymous', 'restricted', 'failed load'])(
    'does not browse-track %s',
    async (condition) => {
      if (condition === 'no consent') consent(false);
      if (condition === 'DNT')
        Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '1' });
      if (condition === 'automation')
        Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true });
      if (condition === 'anonymous') mocks.user = null;
      if (condition === 'restricted')
        mocks.rpc.mockResolvedValue({ data: { allowed: false }, error: null });
      if (condition === 'failed load')
        mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
      const hook = mount();
      if (condition !== 'anonymous')
        await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
      expect(mocks.insert).not.toHaveBeenCalled();
    },
  );
  it('records consent granted after results load, once', async () => {
    consent(false);
    const hook = mount();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    consent(true);
    act(() => {
      window.dispatchEvent(
        new CustomEvent('cookieConsentUpdated', { detail: { analytics: true } }),
      );
    });
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
  });
  it('links only a successful request reference and keeps private details out of both payloads', async () => {
    const hook = mount();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await act(async () => {
      await hook.result.current.action.mutateAsync({
        action: 'request',
        data: { id: 'plan-private' },
      });
    });
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(2));
    const row = mocks.insert.mock.calls[1][1];
    expect(row).toEqual({
      user_id: 'traveller',
      event_type: 'travel_meet_request',
      entity_type: 'travel_request',
      entity_id: 'request-reference',
      metadata: { surface: 'meet_travel' },
      session_id: null,
    });
    expect(mocks.umami).toHaveBeenCalledWith('travel_meet_request', { surface: 'meet_travel' });
    expect(JSON.stringify(row)).not.toContain('plan-private');
    expect(JSON.stringify(row)).not.toContain('2099');
  });
  it('does not record unsuccessful requests and telemetry failures do not fail successful requests', async () => {
    mocks.insert.mockResolvedValue(false);
    const hook = mount();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'expired' } });
    await act(async () => {
      await expect(
        hook.result.current.action.mutateAsync({ action: 'request', data: { id: 'plan' } }),
      ).rejects.toThrow();
    });
    expect(
      mocks.insert.mock.calls.filter(([, row]) => row.event_type === 'travel_meet_request'),
    ).toHaveLength(0);
    await act(async () => {
      await expect(
        hook.result.current.action.mutateAsync({ action: 'request', data: { id: 'plan' } }),
      ).resolves.toEqual({ id: 'request-reference' });
    });
  });
  it('rechecks consent while earlier telemetry is pending without blocking the user action', async () => {
    let release!: (ok: boolean) => void;
    mocks.insert.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    );
    const hook = mount();
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    await act(async () => {
      await hook.result.current.action.mutateAsync({ action: 'request', data: { id: 'plan' } });
    });
    consent(false);
    await act(async () => {
      release(true);
    });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
