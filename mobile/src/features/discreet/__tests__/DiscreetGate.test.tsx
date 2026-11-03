import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when_unlocked_this_device_only',
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
}));

const mockAuth = jest.fn();
jest.mock('expo-local-authentication', () => ({
  authenticateAsync: (...a: unknown[]) => mockAuth(...a),
}));

jest.mock('expo-screen-capture', () => ({
  enableAppSwitcherProtectionAsync: jest.fn(async () => {}),
  disableAppSwitcherProtectionAsync: jest.fn(async () => {}),
  preventScreenCaptureAsync: jest.fn(async () => {}),
  allowScreenCaptureAsync: jest.fn(async () => {}),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));

import '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DiscreetGate, useDiscreet } from '../DiscreetGate';
import { STORAGE_KEY } from '../settings';

function QuickExitProbe() {
  const { quickExit } = useDiscreet();
  return (
    <Text accessibilityRole="button" onPress={quickExit}>
      exit
    </Text>
  );
}

async function renderGate(client = new QueryClient()) {
  await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <DiscreetGate>
          <Text>secret venue list</Text>
          <QuickExitProbe />
        </DiscreetGate>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  mockStore.clear();
  mockAuth.mockReset();
  mockReplace.mockReset();
});

it('with the lock off, shows the app and never prompts', async () => {
  await renderGate();
  expect(await screen.findByText('secret venue list')).toBeTruthy();
  expect(screen.queryByText('Locked')).toBeNull();
  expect(mockAuth).not.toHaveBeenCalled();
});

it('with the lock on, covers the app on cold start and hides it from screen readers', async () => {
  mockStore.set(STORAGE_KEY, JSON.stringify({ lockEnabled: true }));
  mockAuth.mockResolvedValue({ success: false, error: 'user_cancel' });
  await renderGate();
  expect(await screen.findByText('Locked')).toBeTruthy();
  expect(mockAuth).toHaveBeenCalled();
  // Still mounted for the navigator, but not reachable by accessibility queries.
  expect(screen.queryByText('secret venue list')).toBeNull();
  expect(screen.getByText('secret venue list', { includeHiddenElements: true })).toBeTruthy();
});

it('unlocks only after authentication succeeds', async () => {
  mockStore.set(STORAGE_KEY, JSON.stringify({ lockEnabled: true }));
  mockAuth.mockResolvedValue({ success: false, error: 'user_cancel' });
  await renderGate();
  const unlock = await screen.findByRole('button', { name: 'Unlock' });

  // A failed attempt keeps it locked.
  await fireEvent.press(unlock);
  expect(screen.getByText('Locked')).toBeTruthy();

  mockAuth.mockResolvedValue({ success: true });
  await fireEvent.press(unlock);
  expect(await screen.findByText('secret venue list')).toBeTruthy();
  expect(screen.queryByText('Locked')).toBeNull();
});

it('quick exit drops cached data and goes to the cover screen', async () => {
  const client = new QueryClient();
  client.setQueryData(['venues', 'detail', 'x'], { name: 'cached' });
  await renderGate(client);
  await act(async () => {
    (await screen.findByText('exit')).props.onPress();
  });
  expect(client.getQueryData(['venues', 'detail', 'x'])).toBeUndefined();
  expect(mockReplace).toHaveBeenCalledWith('/cover');
});
