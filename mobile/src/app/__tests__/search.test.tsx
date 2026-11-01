import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setOfflineDb } from '@/features/packs/offline';
import { installPack, migrate } from '@/features/packs/store';
import { memoryDb } from '@/test/memoryDb';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en', regionCode: 'CH' }] }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Stack: { Screen: () => null } }));

// The real search module runs; only the network and the pack store are faked.
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;
const offline = () => fetchMock.mockRejectedValue(new TypeError('Network request failed'));

async function packWithMylord() {
  const db = memoryDb();
  await migrate(db);
  await installPack(
    db,
    {
      format: 1,
      id: 'zuerich',
      name: 'Zurich',
      country: 'CH',
      generated_at: '2026-11-01T00:00:00Z',
      hotlines: [],
      venues: [
        {
          id: 'v1',
          slug: 'mylord',
          name: 'Mylord',
          category: 'sauna',
          latitude: 47.37,
          longitude: 8.54,
          city: 'Zurich',
          country: 'CH',
          address: 'Zähringerstrasse 33',
          description: null,
          website: null,
          phone: null,
          instagram: null,
          tags: null,
          accessibility_attributes: null,
        },
      ],
    },
    { id: 'zuerich', name: 'Zurich', country: 'CH', generated_at: '', bytes: 1, sha256: 'a'.repeat(64), venues: 1 },
  );
  return db;
}

import '@/i18n';
import SearchScreen from '../search';
import { ThemeProvider } from '@/theme/ThemeProvider';

async function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <SearchScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

// Real timers: the 250 ms debounce elapses inside findBy*'s default wait.
async function type(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Search places'), text);
  await act(() => new Promise((r) => setTimeout(r, 300)));
}

beforeEach(() => fetchMock.mockReset());
afterEach(() => setOfflineDb(null));

it('asks for two letters before searching', async () => {
  await renderScreen();
  await type('m');
  expect(screen.getByText('Type at least two letters.')).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('lists online results without the offline label', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ hits: [{ type: 'venue', slug: 'mylord', name: 'Mylord', category: 'sauna', city: 'Zurich' }] }),
  });
  await renderScreen();
  await type('myl');
  expect(await screen.findByText('Mylord')).toBeTruthy();
  expect(screen.queryByText(/Offline —/)).toBeNull();
});

it('falls back to downloaded cities offline, and labels those results', async () => {
  setOfflineDb(packWithMylord());
  offline();
  await renderScreen();
  await type('myl');
  expect(await screen.findByText('Mylord')).toBeTruthy();
  expect(screen.getByText(/Offline — showing results from your downloaded cities/)).toBeTruthy();
});

it('says search needs a connection when it fails, rather than "no results"', async () => {
  setOfflineDb(packWithMylord());
  offline();
  await renderScreen();
  await type('berghain');
  expect(await screen.findByText(/Search needs a connection/)).toBeTruthy();
  expect(screen.queryByText('No places match.')).toBeNull();
});
