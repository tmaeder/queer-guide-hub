import { expect, type Page } from '@playwright/test';
import { test, TRIP_TIMEZONE } from './support/tripPlannerFixtures';

const ZURICH = '35d1d772-8ce7-4c05-92a5-95ea7053b4bf';
const SWITZERLAND = '1b9cb03c-a611-4422-ba64-51f348a3b501';
const dateKey = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: TRIP_TIMEZONE }).format(date);

function snapshotExists(page: Page, tripId: string, accountId: string) {
  return page.evaluate(
    async ({ tripId, accountId }) => {
      const response = await caches.match(`/_trip-snapshot/${tripId}.json`, {
        cacheName: `trip-snapshot-account-${accountId}`,
      });
      return !!response;
    },
    { tripId, accountId },
  );
}

async function saveOffline(page: Page, tripId: string, accountId: string) {
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      message: 'The production service worker must activate before saving a trip',
      timeout: 30_000,
    })
    .toBe(true);
  await page.getByRole('button', { name: 'Trip actions' }).click();
  await page.getByRole('menuitem', { name: 'Save trip for offline use' }).click();
  await expect.poll(() => snapshotExists(page, tripId, accountId), { timeout: 30_000 }).toBe(true);
}

async function openColdOffline(page: Page, path: string, check: () => Promise<void>) {
  const context = page.context();
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Network.clearBrowserCache');
  } finally {
    await cdp.detach();
  }
  await context.setOffline(true);
  try {
    // A new document and an uncached navigation URL rule out React Query
    // state and the navigation cache as the source of the saved itinerary.
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await check();
  } finally {
    await context.setOffline(false);
  }
}

test('plans, shares, and reopens a trip with account-scoped offline access', async ({
  tripFixture: { admin, owner, viewer, ownerPage: page, viewerPage, guestPage, suffix },
}) => {
  const now = new Date();
  await Promise.all([page.clock.setFixedTime(now), viewerPage.clock.setFixedTime(now)]);
  const today = dateKey(now);
  const yesterday = dateKey(new Date(now.getTime() - 86_400_000));
  const title = `Trip QA Zurich ${suffix}`;
  const stop = `Trip QA lakeside ${suffix}`;
  const booking = `Trip QA hotel ${suffix}`;
  const code = `QA-${suffix}`;
  const nav = page.getByRole('navigation', { name: 'Trip workspace' });

  const tripId =
    await test.step('Create a trip and schedule a stop from the itinerary', async () => {
      const seed = new URLSearchParams({
        cityId: ZURICH,
        cityName: 'Zurich',
        countryId: SWITZERLAND,
        countryName: 'Switzerland',
        countryCode: 'CH',
        timezone: TRIP_TIMEZONE,
        start: today,
        end: today,
      });
      await page.goto(`/hub/plans?${seed}`, { waitUntil: 'domcontentloaded' });
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Trip title').fill(title);
      await dialog.getByRole('button', { name: 'Create trip', exact: true }).click();
      await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}/);
      const id = new URL(page.url()).pathname.split('/').at(-1)!;
      const owned = await admin
        .from('trips')
        .select('id')
        .eq('id', id)
        .eq('owner_id', owner.id)
        .eq('title', title)
        .single();
      expect(owned.error, 'The URL must belong to the trip created by this test').toBeNull();

      await nav.getByRole('link', { name: 'Itinerary', exact: true }).click();
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.getByRole('button', { name: 'Add stop', exact: true }).first().click();
      await page.getByRole('tab', { name: /Custom Place/i }).click();
      await page.getByLabel(/Place Name/i).fill(stop);
      await dialog.getByRole('button', { name: 'Add Place', exact: true }).click();
      await expect(
        page.getByText(stop, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Move stop', exact: true }).click();
      const [reordered] = await Promise.all([
        page.waitForResponse((response) => response.url().endsWith('/rpc/reorder_trip_stops')),
        page.getByRole('menuitem', { name: 'Move to day 1' }).click(),
      ]);
      expect(reordered.ok(), 'The production reorder RPC should succeed').toBe(true);
      const moved = await admin
        .from('trip_places')
        .select('day_id')
        .eq('trip_id', id)
        .eq('custom_name', stop)
        .single();
      expect(moved.error).toBeNull();
      expect(moved.data?.day_id).toBeTruthy();
      return id;
    });

  const root = `/trips/${tripId}`;
  await test.step('Load preparation and save the itinerary with a booking', async () => {
    const reservation = await admin.from('reservations').insert({
      trip_id: tripId,
      user_id: owner.id,
      source: 'manual',
      type: 'hotel',
      title: booking,
      status: 'confirmed',
      start_at: now.toISOString(),
      end_at: new Date(now.getTime() + 3_600_000).toISOString(),
      provider: 'Trip QA',
      confirmation_code: code,
    });
    expect(reservation.error).toBeNull();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await nav.getByRole('link', { name: 'Prepare' }).click();
    await expect(page.getByRole('button', { name: /Safety/i }).first()).toBeVisible();
    await saveOffline(page, tripId, owner.id);
  });

  await test.step('Invite a read-only viewer and verify an anonymous share', async () => {
    await nav.getByRole('link', { name: 'People & sharing' }).click();
    await page.getByRole('button', { name: 'Invite or share' }).click();
    await page.locator('#trip-invite-username').fill(viewer.username);
    const invitationResponse = (response: import('@playwright/test').Response) =>
      response.url().includes('/functions/v1/trip-invitations') &&
      response.request().method() === 'POST';
    const [invited] = await Promise.all([
      page.waitForResponse(invitationResponse),
      page.getByRole('button', { name: 'Send invitation', exact: true }).click(),
    ]);
    expect(invited.ok(), 'The in-app invitation should succeed').toBe(true);
    const invitation = await admin
      .from('trip_member_invitations')
      .select('email_requested')
      .eq('trip_id', tripId)
      .eq('user_id', viewer.id)
      .single();
    expect(invitation.error).toBeNull();
    expect(invitation.data?.email_requested).toBe(false);

    const [shared] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/rest/v1/trip_shares') && response.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Create share link', exact: true }).click(),
    ]);
    expect(shared.ok(), 'The share link should be persisted').toBe(true);
    const share = await admin.from('trip_shares').select('token').eq('trip_id', tripId).single();
    if (share.error || !share.data?.token) throw new Error('Missing disposable share link');
    await page.keyboard.press('Escape');
    await guestPage.goto(`/trips/shared/${share.data.token}`, { waitUntil: 'domcontentloaded' });
    await expect(guestPage.getByRole('heading', { name: title })).toBeVisible();
    await expect(guestPage.getByText(stop, { exact: true }).first()).toBeVisible();

    await viewerPage.goto('/trips/invitations', { waitUntil: 'domcontentloaded' });
    await expect(viewerPage.getByRole('heading', { name: title })).toBeVisible();
    const [accepted] = await Promise.all([
      viewerPage.waitForResponse(invitationResponse),
      viewerPage.getByRole('button', { name: 'Accept invitation', exact: true }).click(),
    ]);
    expect(accepted.ok(), 'The viewer should be able to accept the invitation').toBe(true);
    await viewerPage.goto(`${root}?view=plan&section=plan`, { waitUntil: 'domcontentloaded' });
    await expect(viewerPage.getByRole('heading', { name: title })).toBeVisible();
    await expect(viewerPage.getByRole('button', { name: 'Add stop', exact: true })).toHaveCount(0);
    await saveOffline(viewerPage, tripId, viewer.id);
  });

  await test.step('Remove the viewer’s saved copy after online access is revoked', async () => {
    const revoked = await admin
      .from('trip_members')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', viewer.id)
      .select('id');
    expect(revoked.error).toBeNull();
    expect(revoked.data).toHaveLength(1);
    await viewerPage.goto(`${root}?view=today`, { waitUntil: 'domcontentloaded' });
    await expect(
      viewerPage.getByText(/Trip not found|You don't have access to this trip/i),
    ).toBeVisible();
    await expect.poll(() => snapshotExists(viewerPage, tripId, viewer.id)).toBe(false);
    await openColdOffline(viewerPage, `${root}?view=today&qa=revoked`, async () => {
      await expect(
        viewerPage.getByRole('heading', { name: 'No offline copy available', exact: true }),
      ).toBeVisible();
      await expect(
        viewerPage.getByText('Reconnect to open the trip and save a copy for offline use.', {
          exact: true,
        }),
      ).toBeVisible();
      expect(await snapshotExists(viewerPage, tripId, viewer.id)).toBe(false);
      await expect(viewerPage.getByText(stop, { exact: true })).toHaveCount(0);
    });
    expect(await snapshotExists(page, tripId, owner.id)).toBe(true);
  });

  await test.step('Reopen Today from cold offline storage as the owner', async () => {
    await nav.getByRole('link', { name: 'Today' }).click();
    await expect(
      page.getByText(booking, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    await openColdOffline(page, `${root}?view=today&qa=owner-offline`, async () => {
      await expect(page.getByText(/showing your last-saved itinerary/i)).toBeVisible();
      await expect(
        page.getByText(stop, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText(booking, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(page.getByText(code, { exact: false })).toHaveCount(0);
    });
  });

  await test.step('Print, follow a legacy packing link, and reopen after the trip ends', async () => {
    await nav.getByRole('link', { name: 'Itinerary' }).click();
    await page.getByRole('button', { name: 'Trip actions' }).click();
    await page.getByRole('menuitem', { name: /Print.*save as PDF/i }).click();
    const print = page.getByRole('button', { name: /Print.*save as PDF/i });
    await expect(print).toBeEnabled();
    await page.evaluate(() => {
      window.print = () => {
        document.documentElement.dataset.tripQaPrinted = 'yes';
      };
    });
    await print.click();
    await expect(page.locator('html')).toHaveAttribute('data-trip-qa-printed', 'yes');

    await page.goto(`${root}/packing`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/section=prepare&tool=packing/);
    await expect(page.getByRole('button', { name: /Packing/ }).first()).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    const past = await admin
      .from('trips')
      .update({ start_date: yesterday, end_date: yesterday })
      .eq('id', tripId)
      .eq('owner_id', owner.id);
    expect(past.error).toBeNull();
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await expect(nav.getByRole('link', { name: 'People & sharing' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Today' })).toHaveCount(0);
  });
});

test('tracks hotel, flight, and activity partner handoffs in the trip', async ({
  tripFixture: { owner, ownerPage: page, admin, suffix },
}) => {
  // Stub offer discovery while keeping authentication, trip and reservation writes live.
  await page.route('**/functions/v1/hotel-search', (route) =>
    route.fulfill({
      json: {
        hotels: [
          {
            hotelId: 1,
            hotelName: 'Rainbow Hotel',
            priceFrom: 125,
            currency: 'CHF',
            bookingUrl: 'https://partner.example/hotel',
          },
        ],
      },
    }),
  );
  await page.route('**/functions/v1/activity-search', (route) =>
    route.fulfill({
      json: {
        activities: [
          {
            activityId: 2,
            title: 'Old town walk',
            price: 32,
            currency: 'CHF',
            bookingUrl: 'https://partner.example/activity',
          },
        ],
      },
    }),
  );

  const nextYear = new Date().getUTCFullYear() + 1;
  const seed = new URLSearchParams({
    cityId: ZURICH,
    cityName: 'Zurich',
    countryId: SWITZERLAND,
    countryName: 'Switzerland',
    countryCode: 'CH',
    timezone: TRIP_TIMEZONE,
    start: `${nextYear}-03-15`,
    end: `${nextYear}-03-18`,
  });
  const title = `Trip QA Zurich ${suffix}`;
  await page.goto(`/hub/plans?${seed}`);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Trip title').fill(title);
  await dialog.getByRole('button', { name: 'Create trip', exact: true }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}/);
  const tripId = new URL(page.url()).pathname.split('/').at(-1)!;
  const owned = await admin
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .eq('owner_id', owner.id)
    .single();
  expect(owned.error).toBeNull();

  await page
    .getByRole('navigation', { name: 'Trip workspace' })
    .getByRole('link', { name: 'Itinerary' })
    .click();
  await page.getByRole('link', { name: 'Trip bookings', exact: true }).click();
  const wizard = page.getByRole('region', { name: 'Trip bookings' });
  await expect(wizard.getByRole('button', { name: 'Book', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await wizard.getByRole('button', { name: /Rainbow Hotel/ }).click();
  await dialog.getByRole('button', { name: 'Save as pending' }).click();
  await expect(wizard.getByRole('link', { name: 'Continue on partner site' })).toHaveAttribute(
    'href',
    'https://partner.example/hotel',
  );

  await wizard.getByRole('button', { name: 'Flights', exact: true }).click();
  const origin = wizard.getByLabel('Departure airport');
  await origin.fill('LHR');
  await wizard.getByRole('option', { name: /LHR/ }).first().click();
  await expect(wizard.getByLabel('Arrival airport')).toHaveValue(/ZRH/);
  await wizard.getByRole('button', { name: 'Review flight search' }).click();
  await dialog.getByRole('button', { name: 'Save as pending' }).click();
  await expect(wizard.getByRole('link', { name: 'Continue on partner site' })).toHaveCount(2);

  await wizard.getByRole('button', { name: 'Activities', exact: true }).click();
  await wizard.getByRole('button', { name: /Old town walk/ }).click();
  await dialog.getByRole('button', { name: 'Save as pending' }).click();
  await expect(wizard.getByRole('link', { name: 'Continue on partner site' })).toHaveCount(3);

  await page.reload();
  await expect(wizard.getByRole('link', { name: 'Continue on partner site' })).toHaveCount(3);
  const before = await admin
    .from('reservations')
    .select('id,type,status')
    .eq('trip_id', tripId)
    .eq('user_id', owner.id);
  expect(before.error).toBeNull();
  expect(before.data).toHaveLength(3);
  expect(before.data).toEqual(
    expect.arrayContaining(
      ['hotel', 'flight', 'activity'].map((type) =>
        expect.objectContaining({ type, status: 'pending' }),
      ),
    ),
  );
  const hotel = before.data!.find((r) => r.type === 'hotel')!;
  await wizard
    .getByText('Rainbow Hotel', { exact: true })
    .locator('..')
    .getByRole('button', { name: 'Record confirmation' })
    .click();
  await dialog.getByLabel('Confirmation Code').fill('QA-CONFIRM');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(wizard.getByRole('link', { name: 'Continue on partner site' })).toHaveCount(2);
  const confirmed = await admin
    .from('reservations')
    .select('id,status,confirmation_code')
    .eq('id', hotel.id)
    .single();
  expect(confirmed.data).toEqual({
    id: hotel.id,
    status: 'confirmed',
    confirmation_code: 'QA-CONFIRM',
  });
  await page.getByRole('button', { name: 'Reservations', exact: true }).click();
  await expect(page.getByText('QA-CONFIRM', { exact: true })).toBeVisible();
});
