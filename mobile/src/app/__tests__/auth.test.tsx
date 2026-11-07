import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en', regionCode: 'CH' }] }));
const mockRouter = { back: jest.fn(), replace: jest.fn() };
let mockParams: { code?: string; reset?: string } = {};
jest.mock('expo-router', () => ({
  get router() { return mockRouter; },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));
const mockSignUp = jest.fn();
const mockSignIn = jest.fn();
const mockSendOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockExchange = jest.fn();
const mockUpdatePassword = jest.fn();
jest.mock('@/features/auth/api', () => ({
  ...jest.requireActual('@/features/auth/api'),
  signUp: (...a: unknown[]) => mockSignUp(...a),
  signIn: (...a: unknown[]) => mockSignIn(...a),
  sendOtp: (...a: unknown[]) => mockSendOtp(...a),
  verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
  exchangeRecoveryCode: (...a: unknown[]) => mockExchange(...a),
  updatePassword: (...a: unknown[]) => mockUpdatePassword(...a),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

it('signs in with an email code by default, without creating an account', async () => {
  mockSendOtp.mockResolvedValue(undefined);
  mockVerifyOtp.mockResolvedValue(undefined);
  await renderScreen();
  expect(screen.queryByLabelText('Password')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.ch');
  await fireEvent.press(screen.getByRole('button', { name: 'Email me a code' }));
  expect(mockSendOtp).toHaveBeenCalledWith('a@b.ch', undefined);
  const code = await screen.findByLabelText('Code');
  expect(code.props.textContentType).toBe('oneTimeCode');
  expect(code.props.autoComplete).toBe('one-time-code');
  await fireEvent.changeText(code, '12345');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockVerifyOtp).not.toHaveBeenCalled();
  expect(screen.getByText('Enter the 6-digit code from the email.')).toBeTruthy();
  await fireEvent.changeText(code, '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockVerifyOtp).toHaveBeenCalledWith('a@b.ch', '123456');
  expect(mockRouter.back).toHaveBeenCalled();
});

it('sends a sign-up code only after consent, carrying the consent moment', async () => {
  mockSendOtp.mockResolvedValue(undefined);
  await renderScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Create account' }));
  await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.ch');
  await fireEvent.press(screen.getByRole('button', { name: 'Email me a code' }));
  expect(mockSendOtp).not.toHaveBeenCalled();
  await fireEvent(screen.getByRole('switch'), 'valueChange', true);
  await fireEvent.press(screen.getByRole('button', { name: 'Email me a code' }));
  expect(mockSendOtp).toHaveBeenCalledWith('a@b.ch', expect.any(Date));
});

it('turns a cold recovery link into a set-new-password form and returns home', async () => {
  mockParams = { code: 'pkce-code', reset: '1' };
  mockExchange.mockResolvedValue(undefined);
  mockUpdatePassword.mockResolvedValue(undefined);
  await renderScreen();
  expect(mockExchange).toHaveBeenCalledWith('pkce-code');
  await fireEvent.changeText(await screen.findByLabelText('New password'), 'longenough');
  await fireEvent.press(screen.getByRole('button', { name: 'Set new password' }));
  expect(mockUpdatePassword).toHaveBeenCalledWith('longenough');
  expect(mockRouter.replace).toHaveBeenCalledWith('/');
});

it('does not treat an unmarked callback as password recovery', async () => {
  mockParams = { code: 'pkce-code' };
  await renderScreen();
  expect(mockExchange).not.toHaveBeenCalled();
});

it('will not create an account until the 18+ terms consent is given', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Create account' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Use a password instead' }));
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
  await fireEvent.press(screen.getByRole('button', { name: 'Use a password instead' }));
  await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.ch');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'longenough');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Email or password is wrong.')).toBeTruthy();
  expect(mockRouter.back).not.toHaveBeenCalled();
});
