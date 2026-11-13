import { randomBytes, randomUUID } from 'node:crypto';
import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import { resolveAnonKey } from './anonKey';
import {
  cleanupTripAccounts,
  recordTripAccount,
  tripAuthOptions,
  tripFixtureAdmin,
  TRIP_PROJECT,
  TRIP_SUPABASE_URL,
  type DisposableTripAccount,
} from './tripPlannerCleanup';

const TRIP_SITE = 'https://queer.guide';
export const TRIP_TIMEZONE = 'Europe/Zurich';

type Account = { id: string; username: string; session: Session };
type TripFixture = {
  admin: ReturnType<typeof tripFixtureAdmin>;
  owner: Account;
  viewer: Account;
  ownerPage: Page;
  viewerPage: Page;
  guestPage: Page;
  suffix: string;
};

export const test = base.extend<{ tripFixture: TripFixture }>({
  tripFixture: async (
    { browser, playwright, viewport, isMobile, hasTouch, deviceScaleFactor },
    runTest,
  ) => {
    const admin = tripFixtureAdmin();
    const publicRequest = await playwright.request.newContext({ baseURL: TRIP_SITE });
    const contexts: BrowserContext[] = [];
    const accounts: DisposableTripAccount[] = [];
    const errors: unknown[] = [];
    const suffix = randomBytes(6).toString('hex');

    async function openPage(session?: Session) {
      const context = await browser.newContext({
        viewport,
        isMobile,
        hasTouch,
        deviceScaleFactor,
        timezoneId: TRIP_TIMEZONE,
        locale: 'en-US',
        serviceWorkers: 'allow',
        baseURL: TRIP_SITE,
        storageState: {
          cookies: [],
          origins: [
            {
              origin: TRIP_SITE,
              localStorage: [
                {
                  name: 'queer-guide-cookie-consent',
                  value: JSON.stringify({
                    preferences: {
                      necessary: true,
                      functional: false,
                      analytics: false,
                      marketing: false,
                    },
                    version: '1.0',
                    timestamp: new Date().toISOString(),
                  }),
                },
                ...(session
                  ? [{ name: `sb-${TRIP_PROJECT}-auth-token`, value: JSON.stringify(session) }]
                  : []),
              ],
            },
          ],
        },
      });
      contexts.push(context);
      return context.newPage();
    }

    try {
      const anonKey = await resolveAnonKey(publicRequest);
      if (!anonKey) throw new Error('Could not resolve the public Supabase key');
      const createAccount = async (role: 'owner' | 'viewer'): Promise<Account> => {
        const email = `trip-qa-${role}-${suffix}@example.test`;
        const password = randomBytes(24).toString('hex');
        const now = new Date().toISOString();
        const id = randomUUID();
        // Record the ID before the request, so cleanup can recover a write
        // whose response was lost or a CI worker that was interrupted.
        recordTripAccount({ id, email });
        accounts.push({ id, email });
        const created = await admin.auth.admin.createUser({
          id,
          email,
          password,
          email_confirm: true,
          user_metadata: { terms_accepted_at: now, privacy_accepted_at: now },
        });
        const user = created.data.user;
        if (created.error || user?.id !== id)
          throw new Error(`Could not provision disposable ${role}`);

        const [profile, preferences] = await Promise.all([
          admin.from('profiles').select('username').eq('user_id', user.id).single(),
          admin
            .from('email_delivery_preferences')
            .select('trip_invites_enabled')
            .eq('user_id', user.id),
        ]);
        if (profile.error || !profile.data?.username)
          throw new Error(`Missing disposable ${role} profile`);
        if (preferences.error || preferences.data.some((row) => row.trip_invites_enabled)) {
          throw new Error(
            `Could not verify that invitation email is off for the disposable ${role}`,
          );
        }
        const signedIn = await createClient(TRIP_SUPABASE_URL, anonKey, {
          auth: tripAuthOptions,
        }).auth.signInWithPassword({ email, password });
        if (signedIn.error || !signedIn.data.session)
          throw new Error(`Could not sign in disposable ${role}`);
        return { id: user.id, username: profile.data.username, session: signedIn.data.session };
      };

      const owner = await createAccount('owner');
      const viewer = await createAccount('viewer');
      const ownerPage = await openPage(owner.session);
      const viewerPage = await openPage(viewer.session);
      const guestPage = await openPage();
      await runTest({ admin, owner, viewer, ownerPage, viewerPage, guestPage, suffix });
    } catch (error) {
      errors.push(error);
    } finally {
      // Stop browser writes before removing owned rows, including writes for
      // which the test never received a response. Auth/trip foreign keys
      // cascade to the corresponding profiles, stops, invitations and shares.
      const closing = await Promise.allSettled(contexts.map((context) => context.close()));
      for (const result of closing) if (result.status === 'rejected') errors.push(result.reason);
      await publicRequest.dispose().catch((error: unknown) => errors.push(error));

      await cleanupTripAccounts(admin, accounts).catch((error: unknown) => errors.push(error));
    }
    if (errors.length) throw new AggregateError(errors, 'Trip regression fixture failed');
  },
});
