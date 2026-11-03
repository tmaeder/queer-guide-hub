import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en', regionCode: 'CH' }] }));
const mockRouter = { dismissAll: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ get router() { return mockRouter; }, Stack: { Screen: () => null } }));
jest.mock('@/features/auth/useSession', () => ({
  useSession: () => ({ user: { id: 'u1', email: 'a@b.ch' } }),
}));
const mockDelete = jest.fn();
jest.mock('@/features/auth/api', () => ({
  ...jest.requireActual('@/features/auth/api'),
  deletionConfirmationTarget: async () => 'mx_tobi',
  deleteAccount: (c: string) => mockDelete(c),
}));

import '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';
import DeleteAccountScreen from '../account/delete';

async function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const clear = jest.spyOn(qc, 'clear');
  await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <DeleteAccountScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { clear };
}

beforeEach(() => jest.clearAllMocks());

it('stays disabled until the username is typed, then deletes and clears every cached query', async () => {
  mockDelete.mockResolvedValue(undefined);
  const { clear } = await renderScreen();
  const field = await screen.findByLabelText('Type mx_tobi to confirm');
  const button = screen.getByRole('button', { name: 'Delete my account permanently' });
  expect(button.props.accessibilityState.disabled).toBe(true);

  await fireEvent.changeText(field, 'a@b.ch'); // the email is not what the server checks here
  expect(button.props.accessibilityState.disabled).toBe(true);

  await fireEvent.changeText(field, 'MX_TOBI');
  expect(screen.getByRole('button', { name: 'Delete my account permanently' }).props.accessibilityState.disabled).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete my account permanently' }));
  expect(mockDelete).toHaveBeenCalledWith('MX_TOBI');
  expect(clear).toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledWith('/');
});

it('stays on the screen and says so when deletion fails', async () => {
  mockDelete.mockRejectedValue(new Error('Deletion failed'));
  await renderScreen();
  await fireEvent.changeText(await screen.findByLabelText('Type mx_tobi to confirm'), 'mx_tobi');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete my account permanently' }));
  expect(await screen.findByText(/couldn't be deleted/)).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
