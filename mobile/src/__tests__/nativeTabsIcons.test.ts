import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * NativeTabs `md` (Material Symbols) icons need expo-symbols on Android, and
 * without it the app throws on launch — every Android user, before any
 * screen renders. jest, tsc and Metro all pass without it; only a device
 * finds it. Found by .github/workflows/mobile-e2e.yml.
 */
it('expo-symbols is installed whenever a tab icon uses `md`', () => {
  const layout = readFileSync(join(__dirname, '../app/(tabs)/_layout.tsx'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
  expect(layout).toMatch(/\bmd="/); // positive control: the check is about something
  expect(pkg.dependencies).toHaveProperty('expo-symbols');
});
