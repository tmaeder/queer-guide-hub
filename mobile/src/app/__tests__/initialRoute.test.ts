import { unstable_settings } from '../_layout';

// Back from a deep-linked screen must land on the tabs, not close the app.
it('the root stack starts at the tabs, under any deep-linked screen', () => {
  expect(unstable_settings.initialRouteName).toBe('(tabs)');
});
