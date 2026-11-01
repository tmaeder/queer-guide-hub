import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en', regionCode: 'CH' }] }));
const mockRouter = { back: jest.fn() };
jest.mock('expo-router', () => ({ get router() { return mockRouter; }, Stack: { Screen: () => null } }));
const mockSignUp = jest.fn();
const mockSignIn = jest.fn();
jest.mock('@/features/auth/api', () => ({
  ...jest.requireActual('@/features/auth/api'),
  signUp: (...a: unknown[]) => mockSignUp(...a),
  signIn: (...a: unknown[]) => mockSignIn(...a),
}));

import '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';
import AuthScreen from '../auth';

async function renderScreen() {
  await render(
    <ThemeProvider>
      <AuthScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

it('will not create an account until the 18+ terms consent is given', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Create account' }));
  await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.ch');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'longenough');
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  expect(mockSignUp).not.toHaveBeenCalled();
  expect(screen.getByText(/confirm you are 18 or older to create an account/)).toBeTruthy();

  await fireEvent(screen.getByRole('switch'), 'valueChange', true);
  mockSignUp.mockResolvedValue(undefined);
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  expect(mockSignUp).toHaveBeenCalledWith('a@b.ch', 'longenough');
  expect(mockRouter.back).toHaveBeenCalled();
});

it('shows a mapped message, not the raw server error, on a failed sign-in', async () => {
  mockSignIn.mockRejectedValue({ code: 'invalid_credentials', message: 'Invalid login credentials' });
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.ch');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'longenough');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Email or password is wrong.')).toBeTruthy();
  expect(mockRouter.back).not.toHaveBeenCalled();
});
