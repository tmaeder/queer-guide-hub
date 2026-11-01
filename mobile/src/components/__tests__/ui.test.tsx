import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Alert, Button, StateMessage } from '../ui';

const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
beforeEach(() => announce.mockClear());

const wrap = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

it('announces an error state, because iOS has no live regions', async () => {
  await wrap(<StateMessage kind="error" message="No connection." />);
  expect(announce).toHaveBeenCalledWith('No connection.');
});

it('does not announce loading or empty states', async () => {
  await wrap(<StateMessage kind="loading" message="Loading…" />);
  await wrap(<StateMessage kind="empty" message="Nothing here." />);
  expect(announce).not.toHaveBeenCalled();
});

it('an Alert is announced and exposed as an alert', async () => {
  await wrap(<Alert message="Email or password is wrong." />);
  expect(announce).toHaveBeenCalledWith('Email or password is wrong.');
  expect(screen.getByRole('alert')).toBeTruthy();
});

it('a busy or disabled button reports it and ignores presses', async () => {
  const onPress = jest.fn();
  await wrap(<Button label="Save" busy onPress={onPress} />);
  const b = screen.getByRole('button', { name: 'Save' });
  expect(b.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
});
