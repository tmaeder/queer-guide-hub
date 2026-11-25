/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { usePersonalityEditorial } from '../usePersonalityEditorial';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/untyped', () => ({ untypedRpc: rpc }));

describe('personality editorial batch loading', () => {
  it('deduplicates, batches and reloads in the selected language', async () => {
    rpc.mockImplementation(async (_name, args) => ({
      data: args.p_ids.map((id: string) => ({
        personality_id: id,
        translations: { description: args.p_lang },
        sources: [],
      })),
      error: null,
    }));
    const i18n = createInstance();
    await i18n.init({
      lng: 'de',
      fallbackLng: 'en',
      resources: { de: { translation: {} }, en: { translation: {} } },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </I18nextProvider>
    );
    const ids = Array.from({ length: 101 }, (_, index) => `id-${index}`);
    const { result } = renderHook(() => usePersonalityEditorial([...ids, ids[0]]), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(101));
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p_ids).toHaveLength(100);
    expect(result.current.get(ids[0])?.translations.description).toBe('de');
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() => expect(result.current.get(ids[0])?.translations.description).toBe('en'));
    expect(rpc).toHaveBeenCalledTimes(4);
  });
});
