import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

// Exercise the deployed app with intercepted APIs: no live trips, plans or messages.
test.use({ serviceWorkers: 'block', storageState: { cookies: [], origins: [] } });
const appOrigin = new URL(process.env.E2E_BASE_URL || 'https://queer.guide').origin;
const cityId = '30000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000001';
const hostId = '10000000-0000-4000-8000-000000000002';
const start = '2099-06-01';
const end = '2099-06-03';
const country = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Germany',
  code: 'DE',
  lgbti_criminalization: { legal: true, death_penalty: 'no' },
  lgbti_employment_protection: { status: 'protected' },
  lgbti_data_last_updated: '2026-11-01',
};
const city = {
  id: cityId,
  name: 'Berlin',
  country_id: country.id,
  timezone: 'Europe/Berlin',
  countries: country,
};
async function fixture(page: Page, signedIn: boolean) {
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'fixture@example.invalid',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  await page.addInitScript(
    ({ user, signedIn }) => {
      localStorage.setItem(
        'queer-guide-cookie-consent',
        JSON.stringify({
          version: '1.0',
          timestamp: new Date().toISOString(),
          preferences: { necessary: true, functional: false, analytics: false, marketing: false },
        }),
      );
      if (signedIn) {
        const encode = (value: object) =>
          btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: 4102444800 })}.fixture`;
        localStorage.setItem(
          'sb-xqeacpakadqfxjxjcewc-auth-token',
          JSON.stringify({
            access_token: token,
            refresh_token: 'fixture',
            token_type: 'bearer',
            expires_at: 4102444800,
            user,
          }),
        );
      }
    },
    { user, signedIn },
  );
  let request: { id: string; status: string; conversation_id: null } | null = null;
  const actions: Record<string, unknown>[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    // Allow the app document, scripts, styles and locale files from the target.
    // Same-origin API calls and every external API stay inside the fixture.
    if (url.origin === appOrigin && !url.pathname.startsWith('/api/')) return route.continue();
    let body: unknown = [];
    if (url.pathname.includes('/auth/v1/')) body = user;
    else if (url.pathname.endsWith('/rpc/travel_meet_list'))
      body = {
        allowed: true,
        alert_id: null,
        own_plans: [],
        plans: [
          {
            id: 'plan',
            owner_id: hostId,
            title: 'Coffee and a gallery visit',
            description:
              'An easy afternoon exploring a couple of galleries. Happy to meet one person or a small group.',
            city_name: 'Berlin',
            city_id: cityId,
            display_name: 'Alex',
            avatar_url: null,
            host_kind: 'traveller',
            activity: 'culture',
            start_date: '2099-06-02',
            end_date: '2099-06-02',
            event_id: null,
            request,
          },
        ],
      };
    else if (url.pathname.endsWith('/rpc/travel_meet_action')) {
      const action = route.request().postDataJSON();
      actions.push(action);
      if (action.p_action === 'request')
        request = { id: 'request', status: 'pending', conversation_id: null };
      body = { id: 'created' };
    } else if (url.pathname.endsWith('/rpc/search_cities'))
      body = [{ ...city, country_name: country.name, country_code: 'DE' }];
    else if (url.pathname.endsWith('/cities')) body = city;
    else if (url.pathname.endsWith('/countries')) body = [country];
    else if (url.pathname.endsWith('/profiles'))
      body = [
        {
          id: userId,
          user_id: userId,
          display_name: 'Traveller',
          username: 'traveller',
          onboarding_completed: true,
        },
      ];
    else if (url.pathname.endsWith('/rpc/search_events')) body = [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return actions;
}
async function capture(page: Page, path: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await expect(page.locator('footer')).toContainText('Queer Guide');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
}
for (const viewport of [
  { name: 'desktop', width: 1440, height: 1050 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`travel invitations and explicit publishing on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const actions = await fixture(page, true);
    await page.goto(`/meet/travel?cityId=${cityId}&start=${start}&end=${end}`);
    await expect(
      page.getByRole('heading', { name: 'Coffee and a gallery visit', exact: true }),
    ).toBeVisible({ timeout: 60000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (process.env.QG_TRAVEL_SCREENSHOTS) {
      await fs.mkdir('.impeccable/review', { recursive: true });
      await capture(page, `.impeccable/review/${viewport.name}.png`);
    }
    await page.getByRole('button', { name: 'Ask to join', exact: true }).click();
    await expect(page.getByText('Waiting for the host to respond')).toBeVisible();
    expect(actions).toEqual([{ p_action: 'request', p_data: { id: 'plan' } }]);
    await page.getByRole('button', { name: 'Suggest a meetup', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Invite someone along', exact: true }),
    ).toBeFocused();
    await page.getByLabel('Your invitation', { exact: true }).fill('A museum afternoon');
    await expect(
      page.getByRole('button', { name: 'Publish invitation', exact: true }),
    ).toBeDisabled();
    await page.getByRole('checkbox', { name: /Share this invitation/ }).check();
    if (process.env.QG_TRAVEL_SCREENSHOTS)
      await capture(page, `.impeccable/review/${viewport.name}-composer.png`);
    await page.getByRole('button', { name: 'Publish invitation', exact: true }).click();
    await expect(page.getByText('Your invitation has been updated.')).toBeVisible();
    expect(actions[1]).toMatchObject({
      p_action: 'create',
      p_data: {
        city_id: cityId,
        start_date: start,
        end_date: end,
        title: 'A museum afternoon',
        trip_id: null,
      },
    });
  });
}
test('anonymous visitors keep their dates through sign-in and never receive profiles', async ({
  page,
}) => {
  const actions = await fixture(page, false);
  await page.goto(`/meet/travel?cityId=${cityId}&start=${start}&end=${end}`);
  await expect(
    page.getByRole('button', { name: 'Sign in to see invitations', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Alex', { exact: true })).toHaveCount(0);
  expect(actions).toHaveLength(0);
  await page.getByRole('button', { name: 'Sign in to see invitations', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\?redirect=/);
  const redirect = new URL(page.url()).searchParams.get('redirect');
  expect(redirect).toBe(`/meet?cityId=${cityId}&start=${start}&end=${end}`);
});
