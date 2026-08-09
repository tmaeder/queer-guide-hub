import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, UsersRound, Rss, UserCheck } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { GatedContentNotice } from '@/components/safety/GatedContentNotice';
import { IntentSheet } from '@/components/people/IntentSheet';
import { PeopleHereRail } from '@/components/people/PeopleHereRail';
import { MeetMembersNotice } from '@/components/people/MeetMembersNotice';
import {
  useMeetSpaces,
  useLocalGroups,
  useNightlifeVenues,
  useEventsWithFallback,
  useDestinationCities,
  type EventWindow,
} from '@/hooks/useIntentData';
import type { SectionDef } from '@/components/entity/editorial';

/**
 * `/people` — the "Meet people" intent.
 *
 * **Place-led, and that is the whole design.** This page used to open on four
 * person-matching tabs (friends / dating / travel / nearby), every one of which
 * needs both a signed-in viewer and a populated member pool. There are 17
 * profiles, of which 2 are discoverable in any mode, 0 presence rows, 0 follows
 * and 0 matches — so all four tabs were empty for every visitor, and a
 * signed-out one got a single line of grey text on an otherwise blank screen.
 * It was the emptiest page on the site and one of six top-level nav intents.
 *
 * The corpus that does exist is places: 175 community centres, 190 queer
 * villages, 4,431 bars, 306 upcoming events, 11 groups. So the page answers
 * "where do queer people gather near me?" from rows that are actually there,
 * and the member section appears above its own honest notice rather than being
 * the spine. Nothing here changes as the community grows: the member rail
 * lights up on its own once there is somebody to show.
 *
 * This is not a new opinion — `INTENT_SCOPE_BIAS` in src/config/navigation.ts
 * already biases this exact intent to `['group', 'event']` with the comment
 * "Groups and events are how meeting actually happens here. There is no user
 * index in search, so this deliberately does not pretend to surface people."
 * The page was the one surface still pretending.
 *
 * The four `/people/<mode>` child routes are untouched and still render the
 * matching views — `/intimate`, `/discover` and `/cruising` redirect into
 * `/people/dating`, and TripTravelBuddiesCTA deep-links to `/people/travel`.
 * Retiring the tab row from the hub also fixes the mobile defect where the
 * row's horizontal overflow pushed "Nearby" and the intent button off-screen
 * at 375px.
 */

const WINDOW_LABEL: Record<EventWindow, string> = {
  tonight: 'tonight',
  'this-weekend': 'this weekend',
  'next-7-days': 'in the next 7 days',
  'next-30-days': 'in the next 30 days',
  anywhere: 'soonest anywhere',
};

/** The community surfaces this intent also covers. Links, not tabs. */
const COMMUNITY_BRIDGE = [
  {
    to: '/community/groups',
    icon: UsersRound,
    key: 'header.nav.groups',
    fallback: 'Groups',
    blurbKey: 'people.community.groups',
    blurb: 'Local and interest groups you can join',
  },
  {
    to: '/community/feed',
    icon: Rss,
    key: 'header.nav.feed',
    fallback: 'Feed',
    blurbKey: 'people.community.feed',
    blurb: 'What the community is posting',
  },
  {
    to: '/community/members',
    icon: UserCheck,
    key: 'header.nav.members',
    fallback: 'Members',
    blurbKey: 'people.community.members',
    blurb: 'Browse everyone who is listed',
  },
] as const;

export default function People() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const [params] = useSearchParams();
  const [intentOpen, setIntentOpen] = useState(false);

  const citySlug = params.get('city');
  const {
    cityId,
    cityName,
    citySlug: resolvedSlug,
    countryCode,
    loading: locLoading,
  } = useIntentLocation(citySlug);

  const { data: spacesResult, isLoading: spacesLoading } = useMeetSpaces(cityId, countryCode, 8);
  const { data: groups } = useLocalGroups(6);
  const { data: eventsResult } = useEventsWithFallback(cityId, 6);
  const { data: venues } = useNightlifeVenues(cityId, 6);
  const { data: cities } = useDestinationCities(8);

  const showNudge = profile != null && !profile.user_mode;
  const where = cityName ?? t('people.yourArea', 'your area');

  // Must match STATIC_ROUTE_META['/people'].title in functions/_lib/routeMeta.ts.
  // The edge fix landed without this line, so a crawler saw the new title while
  // a human's browser tab still read "Meet people — LGBTQ+ friends, dates and
  // travel buddies" — the page's old promise, and exactly the crawler/user
  // divergence the edge entry exists to prevent.
  //
  // `useMeta` appends " | Queer Guide" only when the title does not already end
  // with it, so this renders as "... Events | Queer Guide" against the edge's
  // bare "... Events". That asymmetry is pre-existing and table-wide: /travel
  // and /venues embed the suffix in their edge title, the other four intents do
  // not. Either shape produces exactly one suffix; what must agree is the base
  // string, which is what actually tells the reader what the page is.
  useMeta({
    title: 'Meet LGBTQ+ People — Groups, Spaces and Events',
    description:
      'Where queer people actually gather: community spaces, groups, events and bars near you, plus the members and travel buddies you can meet.',
    canonicalPath: '/people',
  });

  // Dropping empty sections now lives in EditorialDetailLayout, so all six
  // intent pages and /city/:slug get it instead of just this one. Sections that
  // can legitimately be empty (spaces) still render their own explanatory copy;
  // sections with nothing useful to say when empty (bars, city-gated) return
  // null and the layout removes their heading and nav entry along with them.
  const sections: SectionDef[] = [
    {
      id: 'spaces',
      label: t('people.sections.spaces', 'Community spaces'),
      kicker: cityName
        ? t('people.sections.spacesKickerCity', {
            defaultValue: 'Places built for meeting people in {{city}}',
            city: cityName,
          })
        : t('people.sections.spacesKicker', 'Places built for meeting people'),
      content:
        spacesLoading || locLoading ? (
          <p className="text-muted-foreground">{t('people.loadingSpaces', 'Finding places…')}</p>
        ) : spacesResult && spacesResult.spaces.length > 0 ? (
          <div>
            {spacesResult.scope === 'country' ? (
              <CoverageNote>
                {t('people.sections.spacesCountryFallback', {
                  defaultValue:
                    'Nothing is listed in {{where}} itself, so these are elsewhere in the country. Community centres are recorded for 120 cities and queer villages for 104 — a gap here means we have no record, not that there is nowhere to go.',
                  where,
                })}
              </CoverageNote>
            ) : null}
            <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {spacesResult.spaces.map((s) => (
                <li key={s.id} className="rounded-container border-2 border-foreground p-4">
                  <p className="mb-2 text-2xs uppercase tracking-wider text-muted-foreground">
                    {s.kind === 'village'
                      ? t('people.spaceKind.village', 'Queer neighbourhood')
                      : t('people.spaceKind.venue', 'Community centre')}
                  </p>
                  <h3 className="mb-2 font-display text-title">
                    {s.slug ? (
                      <LocalizedLink
                        to={s.kind === 'village' ? `/place/${s.slug}` : `/venues/${s.slug}`}
                        className="no-underline hover:underline"
                      >
                        {s.name}
                      </LocalizedLink>
                    ) : (
                      s.name
                    )}
                  </h3>
                  {s.description ? (
                    <p className="line-clamp-3 text-13 text-muted-foreground">{s.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">
            {t('people.sections.spacesEmpty', {
              defaultValue: 'No community spaces are listed for {{where}} yet.',
              where,
            })}{' '}
            <LocalizedLink to="/submit" className="underline underline-offset-4">
              {t('people.addPlace', 'Add one')}
            </LocalizedLink>
            .
          </p>
        ),
      action: (
        <LocalizedLink to="/venues" className="text-13 no-underline hover:underline">
          {t('people.allVenues', 'All venues')}
        </LocalizedLink>
      ),
    },
    {
      id: 'groups',
      label: t('people.sections.groups', 'Groups to join'),
      kicker: t('people.sections.groupsKicker', 'Smaller rooms than a whole city'),
      content:
        groups && groups.length > 0 ? (
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <li key={g.id} className="rounded-container border-2 border-foreground p-4">
                <h3 className="mb-2 font-display text-title">
                  <LocalizedLink
                    to={`/community/groups/${g.id}`}
                    className="no-underline hover:underline"
                  >
                    {g.name}
                  </LocalizedLink>
                </h3>
                {g.description ? (
                  <p className="mb-2 line-clamp-2 text-13 text-muted-foreground">{g.description}</p>
                ) : null}
                <p className="text-2xs uppercase tracking-wider text-muted-foreground">
                  {t('people.groupMembers', {
                    defaultValue: '{{count}} members',
                    count: g.member_count ?? 0,
                  })}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {t('people.sections.groupsEmpty', 'No public groups yet.')}
          </p>
        ),
      action: (
        <LocalizedLink to="/community/groups" className="text-13 no-underline hover:underline">
          {t('people.allGroups', 'All groups')}
        </LocalizedLink>
      ),
    },
    {
      id: 'whats-on',
      label: t('people.sections.whatsOn', "What's on"),
      kicker: t('people.sections.whatsOnKicker', 'Turning up somewhere beats messaging'),
      content: (
        <div>
          <CoverageNote>
            {eventsResult && eventsResult.events.length > 0
              ? `Showing events ${WINDOW_LABEL[eventsResult.window]}${
                  eventsResult.window === 'anywhere' && cityName
                    ? ` — nothing is listed in ${cityName} in the next 30 days.`
                    : '.'
                }`
              : 'No upcoming events are listed yet.'}{' '}
            Our events coverage is thin: listings come from organisers and submissions, so an empty
            week here means we have no record, not that nothing is happening.
          </CoverageNote>
          {eventsResult && eventsResult.events.length > 0 ? (
            <ul className="m-0 list-none p-0">
              {eventsResult.events.map((e) => (
                <li key={e.id} className="border-b border-border py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">
                      {e.slug ? (
                        <LocalizedLink
                          to={`/events/${e.slug}`}
                          className="no-underline hover:underline"
                        >
                          {e.title}
                        </LocalizedLink>
                      ) : (
                        e.title
                      )}
                    </span>
                    <span className="whitespace-nowrap text-13 text-muted-foreground">
                      {new Date(e.start_date).toLocaleDateString()}
                      {e.city ? ` · ${e.city}` : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ),
      action: (
        <LocalizedLink to="/events" className="text-13 no-underline hover:underline">
          {t('people.allEvents', 'All events')}
        </LocalizedLink>
      ),
    },
    {
      id: 'regulars',
      label: t('people.sections.regulars', 'Bars and cafés'),
      kicker: t('people.sections.regularsKicker', 'Where people become regulars'),
      // Self-hiding: useNightlifeVenues is city-gated, so this is absent
      // entirely when we could not resolve a city.
      content:
        venues && venues.length > 0 ? (
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((v) => (
              <li key={v.id} className="rounded-container border-2 border-foreground p-4">
                <p className="mb-2 text-2xs uppercase tracking-wider text-muted-foreground">
                  {v.category}
                </p>
                <h3 className="font-display text-title">
                  {v.slug ? (
                    <LocalizedLink
                      to={`/venues/${v.slug}`}
                      className="no-underline hover:underline"
                    >
                      {v.name}
                    </LocalizedLink>
                  ) : (
                    v.name
                  )}
                </h3>
              </li>
            ))}
          </ul>
        ) : null,
      action: (
        <LocalizedLink to="/going-out" className="text-13 no-underline hover:underline">
          {t('people.goingOut', 'Going out')}
        </LocalizedLink>
      ),
    },
    {
      id: 'members',
      label: t('people.sections.members', 'Members'),
      kicker: t('people.sections.membersKicker', 'People you can message directly'),
      content: (
        <div className="space-y-4">
          {/* The rail is the payoff and the notice is the honest fallback.
              emptyState is what makes this section legible at all: with 0
              presence rows the rail is null everywhere on the site, so without
              it this heading would sit above nothing. */}
          <PeopleHereRail
            mode="locals"
            cityId={cityId ?? undefined}
            title={
              cityName
                ? t('people.rail.titleCity', {
                    defaultValue: 'Members in {{city}}',
                    city: cityName,
                  })
                : t('people.rail.title', 'Members to meet')
            }
            seeAllHref="/community/members"
            emptyState={<MeetMembersNotice cityId={cityId ?? undefined} cityName={cityName} />}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            {COMMUNITY_BRIDGE.map(({ to, icon: Icon, key, fallback, blurbKey, blurb }) => (
              <LocalizedLink
                key={to}
                to={to}
                className="flex items-center gap-4 rounded-element border border-border p-4 no-underline transition-colors hover:border-foreground"
              >
                <Icon size={20} className="shrink-0 text-foreground" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="text-15 font-medium text-foreground">{t(key, fallback)}</span>
                  <span className="text-2xs leading-tight text-muted-foreground">
                    {t(blurbKey, blurb)}
                  </span>
                </span>
              </LocalizedLink>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'safety',
      label: t('people.sections.safety', 'Before you go'),
      content: (
        <div>
          {/* Counts only, never rows — safe to call anonymously. */}
          <GatedContentNotice cityId={cityId ?? undefined} />
          <p className="mb-4 max-w-prose">
            {t(
              'people.safetyBody',
              'Meeting strangers carries different risk in different countries. Check the legal position for where you are before you arrange to meet someone.',
            )}
          </p>
          <LocalizedLink
            to="/rights"
            className="inline-block rounded-element border-2 border-foreground px-6 py-2 font-medium no-underline"
          >
            {t('people.safetyCta', 'LGBTQ+ rights by country')}
          </LocalizedLink>
        </div>
      ),
    },
    {
      id: 'elsewhere',
      label: t('people.sections.elsewhere', 'Elsewhere'),
      kicker: t('people.sections.elsewhereKicker', 'Cities with the deepest scenes'),
      content: (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {(cities ?? []).map((c) => (
            <li key={c.id} className="rounded-container border-2 border-foreground p-4">
              <h3 className="font-display text-title">
                {c.slug ? (
                  <LocalizedLink to={`/city/${c.slug}`} className="no-underline hover:underline">
                    {c.name}
                  </LocalizedLink>
                ) : (
                  c.name
                )}
              </h3>
              {c.countries?.name ? (
                <p className="text-13 text-muted-foreground">{c.countries.name}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <>
      <IntentPageLayout
        breadcrumbLabel={t('header.intents.meet.label', 'Meet people')}
        breadcrumbHref="/people"
        eyebrow={cityName ? `In ${cityName}` : undefined}
        title={
          cityName
            ? t('people.titleCity', {
                defaultValue: 'Meet people in {{city}}',
                city: cityName,
              })
            : t('header.intents.meet.label', 'Meet people')
        }
        lede={t(
          'people.lede',
          'The spaces, groups and events where queer people actually gather — plus the members, travel buddies and dates you can find here.',
        )}
        scopeBar={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setIntentOpen(true)}
            >
              <SlidersHorizontal size={14} aria-hidden />
              {t('people.intent.button', "I'm here for…")}
            </Button>
            {showNudge ? (
              <span className="text-13 text-muted-foreground">
                {t(
                  'people.intent.nudge',
                  'Tell us what you’re here for so we can rank people for you.',
                )}
              </span>
            ) : null}
          </div>
        }
        sections={sections}
        footer={
          resolvedSlug ? (
            <LocalizedLink
              to={`/city/${resolvedSlug}`}
              className="font-medium underline underline-offset-4"
            >
              {t('people.fullGuide', {
                defaultValue: 'Full guide to {{city}}',
                city: cityName,
              })}
            </LocalizedLink>
          ) : null
        }
      />
      <IntentSheet open={intentOpen} onOpenChange={setIntentOpen} />
    </>
  );
}
