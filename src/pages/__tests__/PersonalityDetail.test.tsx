/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({ personality: null as unknown }));

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
const useMeta = vi.fn();
vi.mock('@/hooks/useMeta', () => ({ useMeta: (o: unknown) => useMeta(o) }));
vi.mock('@/hooks/usePersonalities', () => ({ usePersonalities: () => ({ data: [], isLoading: false }) }));
vi.mock('@/components/discovery/SimilarItems', () => ({ SimilarItems: () => null }));
vi.mock('@/components/entity/EntityDetailLayout', () => ({ EntityDetailLayout: () => <div>layout</div> }));
vi.mock('../PersonalityDetail.parts', async (orig) => {
  const actual = await orig<typeof import('../PersonalityDetail.parts')>();
  return { ...actual, fetchPersonalityBySlug: () => Promise.resolve(state.personality) };
});

import PersonalityDetail from '../PersonalityDetail';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={['/personalities/p1']}>
      <QueryClientProvider client={qc}>
        <Routes><Route path="/personalities/:slug" element={<PersonalityDetail />} /></Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PersonalityDetail', () => {
  beforeEach(() => {
    useMeta.mockClear();
    state.personality = null;
  });

  it('renders without crashing', () => {
    const { container } = renderPage();
    expect(container).toBeTruthy();
  });

  it('noindexes an unknown slug instead of leaving the loading title indexable', async () => {
    // `metaTitle` used to compute "Personality not found" but nothing ever
    // set `noIndex` — a dead slug shipped a real title with no robots tag
    // and a self-referential canonical, the same soft-404 shape as TagDetail.
    state.personality = null;
    renderPage();
    await waitFor(() => {
      const last = useMeta.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(last?.noIndex).toBe(true);
    });
    const last = useMeta.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last?.title).toBe('Personality not found');
  });
});
