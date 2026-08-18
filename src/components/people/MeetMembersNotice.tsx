import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserPlus, Radio } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { useStatus } from '@/hooks/useStatus';
import { Button } from '@/components/ui/button';

interface MemberCount {
  here: number;
  total: number;
}

/**
 * The honest state for the "Members here" section of /people.
 *
 * Replaces a bare `<p>Sign in to find people.</p>` — no heading, no button, no
 * number — which was the entire signed-out experience of a top-level nav
 * intent. The counts come from `meet_member_count_for_location`, which returns
 * aggregates and never rows, so it is safe to call anonymously. Nothing here
 * shows a person: `people_discovery` is revoked from anon and stays that way.
 *
 * Three states, and which one fires is decided by data rather than by copy:
 *
 *  - members exist, viewer signed out  -> say how many, offer sign-in
 *  - members exist, viewer signed in but not discoverable -> offer the toggle
 *    that would populate the rail (the missing bootstrap affordance)
 *  - no members yet -> say so plainly and invite them to be first
 *
 * The scoped/global split matters: `user_travel_preferences` holds 0 rows and
 * `profiles.travel_mode->>'city_id'` is null everywhere, so `here` is 0 in every
 * city. Rendering "0 members in Zurich" would imply the community is empty
 * *there specifically*, which is a claim the data cannot support. So the city
 * phrasing is used only when `here` is genuinely non-zero.
 */
export function MeetMembersNotice({
  cityId,
  cityName,
  countryId,
}: {
  cityId?: string;
  cityName?: string | null;
  countryId?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { status, setStatus } = useStatus();
  const [enabling, setEnabling] = useState(false);

  const { data } = useQuery({
    queryKey: ['meet-member-count', cityId ?? null, countryId ?? null],
    queryFn: async (): Promise<MemberCount> => {
      const { data, error } = await untypedRpc<MemberCount>('meet_member_count_for_location', {
        p_country_id: countryId ?? null,
        p_city_id: cityId ?? null,
      });
      if (error) throw error;
      return data ?? { here: 0, total: 0 };
    },
    staleTime: 5 * 60 * 1000,
    // The RPC ships in the same change as this component; if it has not been
    // applied yet the query fails and we fall through to the "be first" state,
    // which is the correct thing to show when we cannot prove anyone is there.
    retry: false,
  });

  const here = data?.here ?? 0;
  const total = data?.total ?? 0;
  const optedIntoDiscovery = Boolean(status?.visibility?.in_discovery);

  // Nobody to find yet. True today (2 discoverable members) and the state most
  // visitors will actually see, so it gets real copy rather than a shrug.
  if (total === 0) {
    return (
      <div className="flex flex-col gap-4 bg-card p-6 sm:flex-row sm:items-center sm:justify-between rounded-container shadow-soft">
        <div className="flex items-start gap-4">
          <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <p className="text-body-lg font-medium">
              {t('people.members.emptyTitle', 'No members are listed here yet')}
            </p>
            {/* Position-independent wording: this notice renders both inside
                the hub's Members section (where places sit above it) and alone
                on /people/friends (where nothing does), so it cannot say
                "above". It links to the hub instead. */}
            <p className="text-15 text-muted-foreground">
              {t(
                'people.members.emptyBody',
                'Member profiles are new. Community spaces, groups and events are where people are meeting in the meantime.',
              )}{' '}
              <LocalizedLink to="/people" className="underline underline-offset-4">
                {t('people.members.emptyBodyLink', 'See where to go')}
              </LocalizedLink>
              .
            </p>
          </div>
        </div>
        <Button asChild variant="default">
          <LocalizedLink to={user ? '/settings' : '/auth'} className="shrink-0 no-underline">
            {user
              ? t('people.members.emptyCtaMember', 'Set up your profile')
              : t('people.members.emptyCtaAnon', 'Create a profile')}
          </LocalizedLink>
        </Button>
      </div>
    );
  }

  // Signed in, members exist, but the viewer is not discoverable — so the rail
  // above them is empty for a reason they can fix here.
  //
  // The toggle is written inline rather than linked: `in_discovery` lives in
  // the StatusPicker dialog, which opens only from /profile, so "go to
  // settings" would be three navigations away from the surface that is empty
  // because of it. `setStatus` is the same writer StatusPicker uses.
  if (user && !optedIntoDiscovery) {
    return (
      <div className="flex flex-col gap-4 bg-card p-6 sm:flex-row sm:items-center sm:justify-between rounded-container shadow-soft">
        <div className="flex items-start gap-4">
          <Radio className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <p className="text-body-lg font-medium">
              {t('people.members.discoveryOffTitle', 'You are not discoverable yet')}
            </p>
            <p className="text-15 text-muted-foreground">
              {t('people.members.discoveryOffBody', {
                defaultValue:
                  'Discovery is off by default, so you are hidden — and so is everyone else who has left it off. Turn it on to appear to other members, and to see the {{count}} who are listed.',
                count: total,
              })}
            </p>
          </div>
        </div>
        <Button
          variant="default"
          className="shrink-0"
          disabled={enabling}
          onClick={() => {
            setEnabling(true);
            void setStatus({ visibility: { in_discovery: true } }).finally(() =>
              setEnabling(false),
            );
          }}
        >
          {enabling
            ? t('people.members.discoveryOnPending', 'Turning on…')
            : t('people.members.discoveryOffCta', 'Turn on discovery')}
        </Button>
      </div>
    );
  }

  // Signed out, and there is genuinely somebody to find.
  if (!user) {
    return (
      <div className="flex flex-col gap-4 bg-card p-6 sm:flex-row sm:items-center sm:justify-between rounded-container shadow-soft">
        <div className="flex items-start gap-4">
          <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <p className="text-body-lg font-medium">
              {here > 0 && cityName
                ? t('people.members.countHere', {
                    defaultValue: '{{count}} members listed in {{city}}',
                    count: here,
                    city: cityName,
                  })
                : t('people.members.countTotal', {
                    defaultValue: '{{count}} members are listed',
                    count: total,
                  })}
            </p>
            <p className="text-15 text-muted-foreground">
              {t(
                'people.members.signedOutBody',
                'Member profiles are only shown to signed-in members, never to visitors or search engines.',
              )}
            </p>
          </div>
        </div>
        <Button asChild variant="default">
          <LocalizedLink to="/auth" className="shrink-0 no-underline">
            {t('people.members.signedOutCta', 'Sign in to view')}
          </LocalizedLink>
        </Button>
      </div>
    );
  }

  // Signed in and discoverable, but the engine returned nobody for this scope.
  return (
    <p className="text-muted-foreground">
      {cityName
        ? t('people.members.noneInScope', {
            defaultValue: 'No members to suggest in {{city}} right now.',
            city: cityName,
          })
        : t('people.members.noneGlobal', 'No members to suggest right now.')}
    </p>
  );
}
