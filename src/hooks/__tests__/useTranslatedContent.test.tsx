/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };
const { state, useTranslationMock } = vi.hoisted(() => ({
  state: {
    results: [] as MockResult[],
    calls: [] as Array<{ rpc: string; chain: Array<{ method: string; args: unknown[] }> }>,
  },
  useTranslationMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc(name: string, args: unknown) {
      state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
      const next = state.results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: useTranslationMock }));
vi.mock('@/i18n/languages', () => ({ DEFAULT_LOCALE: 'en' }));

import { useTranslatedContent, useTranslatedList, applyTranslations } from '../useTranslatedContent';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  useTranslationMock.mockReset();
});

describe('useTranslatedContent', () => {
  it('is disabled when language is the default locale (en)', () => {
    useTranslationMock.mockReturnValue({ i18n: { language: 'en' } });
    renderHook(
      () => useTranslatedContent({ table: 'venues', id: 'v1' }),
      { wrapper },
    );
    expect(state.calls).toHaveLength(0);
  });

  it('calls get_translated_content RPC with table/id/lang/fields', async () => {
    useTranslationMock.mockReturnValue({ i18n: { language: 'de' } });
    withResults({ data: { name: 'Berghain (DE)' }, error: null });

    const { result } = renderHook(
      () =>
        useTranslatedContent({
          table: 'venues', id: 'v1', fields: ['name', 'description'],
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args).toEqual({
      p_table: 'venues', p_id: 'v1', p_lang: 'de', p_fields: ['name', 'description'],
    });
  });

  it('throws on RPC error', async () => {
    useTranslationMock.mockReturnValue({ i18n: { language: 'de' } });
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(
      () => useTranslatedContent({ table: 'venues', id: 'v1' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useTranslatedList', () => {
  it('disabled when ids list is empty', () => {
    useTranslationMock.mockReturnValue({ i18n: { language: 'de' } });
    renderHook(() => useTranslatedList({ table: 'venues', ids: [] }), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('returns a Map<record_id, translations> on success', async () => {
    useTranslationMock.mockReturnValue({ i18n: { language: 'de' } });
    withResults({
      data: [
        { record_id: 'v1', translations: { name: 'Berghain (DE)' } },
        { record_id: 'v2', translations: { name: 'SchwuZ (DE)' } },
      ],
      error: null,
    });

    const { result } = renderHook(
      () => useTranslatedList({ table: 'venues', ids: ['v1', 'v2'] }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data instanceof Map).toBe(true);
    expect(result.current.data!.get('v1')?.name).toBe('Berghain (DE)');
    expect(result.current.data!.get('v2')?.name).toBe('SchwuZ (DE)');
  });
});

describe('applyTranslations', () => {
  it('returns the original when no translations', () => {
    const orig = { name: 'X', other: 'Y' };
    expect(applyTranslations(orig, undefined)).toBe(orig);
    expect(applyTranslations(orig, {})).toBe(orig);
  });

  it('overlays translation fields onto the original', () => {
    const orig = { name: 'X', other: 'Y' };
    const out = applyTranslations(orig, { name: 'X-DE' } as never);
    expect(out).toEqual({ name: 'X-DE', other: 'Y' });
  });
});
