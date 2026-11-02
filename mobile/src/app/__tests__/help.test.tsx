import { render, screen } from '@testing-library/react-native';
import type { Hotline } from '@/api/hotlines';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', regionCode: 'CH' }],
}));

const mockLines: Hotline[] = [
  {
    id: 'reports',
    name: 'Line That Reports',
    country: 'CH',
    phone: '+41 800 111 111',
    topics: [],
    languages: [],
    hours: 'Mon–Fri',
    description: '',
    reports_to_police: true,
  },
  {
    id: 'never',
    name: 'Line That Never Reports',
    country: 'CH',
    phone: '+41 800 222 222',
    topics: [],
    languages: [],
    hours: '',
    always_open: true,
    description: '',
    reports_to_police: false,
  },
  {
    id: 'silent',
    name: 'Line With No Policy',
    country: 'INT',
    phone: '+1 800 333 333',
    topics: [],
    languages: [],
    hours: '',
    description: '',
  },
  {
    id: 'dir',
    name: 'Referral Directory',
    country: 'CH',
    phone: null,
    topics: [],
    languages: [],
    hours: '',
    description: '',
    kind: 'directory',
    url: 'https://example.org',
  },
];

jest.mock('@/api/hotlines', () => {
  const actual = jest.requireActual('@/api/hotlines');
  return {
    ...actual,
    useHotlines: () => ({ data: mockLines, isLoading: false, isError: false, refetch: jest.fn() }),
  };
});

import '@/i18n';
import HelpScreen from '../(tabs)/help';
import { ThemeProvider } from '@/theme/ThemeProvider';

function renderHelp() {
  return render(
    <ThemeProvider>
      <HelpScreen />
    </ThemeProvider>,
  );
}

it('lists local 24/7 lines first, then international, and never a directory', async () => {
  await renderHelp();
  const names = (await screen.findAllByText(/^Line /)).map((n) => n.props.children);
  expect(names).toEqual(['Line That Never Reports', 'Line That Reports', 'Line With No Policy']);
  expect(screen.queryByText('Referral Directory')).toBeNull();
});

it('states the police policy only where the operator publishes one', async () => {
  await renderHelp();
  expect(await screen.findAllByText(/may contact police/)).toHaveLength(1);
  expect(screen.getAllByText(/does not contact police/)).toHaveLength(1);
});

it('offers a call button with the number, named after the line it calls', async () => {
  await renderHelp();
  expect(await screen.findByRole('button', { name: 'Call +41 800 111 111, Line That Reports' })).toBeTruthy();
  expect(screen.getByText('Call +41 800 111 111')).toBeTruthy();
  expect(screen.getByText(/local emergency number/)).toBeTruthy();
});
