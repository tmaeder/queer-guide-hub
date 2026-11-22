import { Suspense, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Home, Map, Repeat, UserPlus, Users } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { useMeta } from '@/hooks/useMeta';
import { Skeleton } from '@/components/ui/skeleton';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { useAuth } from '@/hooks/useAuth';
import { defaultUserFilters, useUserDirectoryQuery } from '@/hooks/useUserDirectoryQuery';
import { UserDirectoryGrid } from '@/components/user-directory/UserDirectoryGrid';
import { MeetMembersNotice } from '@/components/people/MeetMembersNotice';
import { useMeetSpaces, useLocalGroups, useEventsWithFallback } from '@/hooks/useIntentData';
import type { SectionDef } from '@/components/entity/editorial';
import { HubNav } from '@/components/hub/HubNav';
import { PeopleDiscoveryLead } from '@/components/people/PeopleDiscoveryLead';
import { DeferredSection } from '@/components/home/DeferredSection';
import { lazyRetry } from '@/utils/lazyRetry';

const PeopleConnectionMap = lazyRetry(() => import('@/components/people/PeopleConnectionMap'));

/**
 * `/hub/people` — the "Meet people" intent inside the unified Hub.
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
 * The focused `/hub/<mode>` routes still render the matching views — legacy
 * `/intimate`, `/discover` and `/cruising` URLs redirect into
 * `/hub/dating`, and TripTravelBuddiesCTA deep-links to `/hub/travel`.
 * Retiring the tab row from the hub also fixes the mobile defect where the
 * row's horizontal overflow pushed "Nearby" and the intent button off-screen
 * at 375px.
 */

export default function People() {
  const { t } = useTranslation();
  const [params] = useSearchParams();

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
  const { user } = useAuth();

  const where = cityName ?? t('people.yourArea', 'your area');

  // Must match STATIC_ROUTE_META['/hub/people'].title in functions/_lib/routeMeta.ts.
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
    canonicalPath: '/hub/people',
  });

  // Dropping empty sections now lives in EditorialDetailLayout, so all six
  // intent pages and /city/:slug get it instead of just this one. Sections that
  // can legitimately be empty (spaces) still render their own explanatory copy;
  // sections with nothing useful to say when empty (bars, city-gated) return
  // null and the layout removes their heading and nav entry along with them.
  const sections: SectionDef[] = [
    {
      id: 'spaces',
      icon: Home,
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
            <ul className="m-0 grid grid-cols-1 list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {spacesResult.spaces.map((s) => (
                <li key={s.id}>
                  <NestedEntityCard
                    type={s.kind === 'village' ? 'queer_village' : 'venue'}
                    eyebrow={
                      s.kind === 'village'
                        ? t('people.spaceKind.village', 'Queer neighbourhood')
                        : t('people.spaceKind.venue', 'Community centre')
                    }
                    name={s.name}
                    description={s.description}
                    href={
                      s.slug
                        ? s.kind === 'village'
                          ? `/place/${s.slug}`
                          : `/venues/${s.slug}`
                        : undefined
                    }
                  />
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
      icon: Users,
      label: t('people.sections.groups', 'Groups to join'),
      kicker: t(
        'people.sections.groupsKickerWorldwide',
        'Public groups from anywhere. Groups are not tied to a city yet.',
      ),
      content:
        groups && groups.length > 0 ? (
          <ul className="m-0 grid grid-cols-1 list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <li key={g.id}>
                <NestedEntityCard
                  type="group"
                  eyebrow={t('people.groupMembers', {
                    defaultValue: '{{count}} members',
                    count: g.member_count ?? 0,
                  })}
                  name={g.name}
                  description={g.description}
                  href={`/hub/groups/${g.id}`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {t('people.sections.groupsEmpty', 'No public groups yet.')}
          </p>
        ),
      action: (
        <LocalizedLink to="/hub/groups" className="text-13 no-underline hover:underline">
          {t('people.allGroups', 'All groups')}
        </LocalizedLink>
      ),
    },
    {
      id: 'members',
      icon: UserPlus,
      label: t('people.sections.members', 'Members'),
      kicker: t('people.sections.membersKicker', 'People you can message directly'),
      content: user ? (
        <MemberDirectory />
      ) : (
        <MeetMembersNotice cityId={cityId ?? undefined} cityName={cityName} />
      ),
      action: user ? (
        <LocalizedLink to="/hub/members" className="text-13 no-underline hover:underline">
          {t('people.searchMembers', 'Search members')}
        </LocalizedLink>
      ) : undefined,
    },
    {
      id: 'regulars',
      icon: Repeat,
      label: t('people.sections.regulars', 'Bars and cafés'),
      // One link, not a venue grid: the same list is the Going out page.
      content: (
        <LocalizedLink
          to={resolvedSlug ? `/going-out?city=${resolvedSlug}` : '/going-out'}
          className="font-medium underline underline-offset-4"
        >
          {cityName
            ? t('people.goingOutCity', {
                defaultValue: 'Bars, cafés and clubs in {{city}} are on Going out',
                city: cityName,
              })
            : t('people.goingOutAll', 'Bars, cafés and clubs are on Going out')}
        </LocalizedLink>
      ),
    },
    {
      id: 'map',
      icon: Map,
      label: t('people.sections.map', 'Connection map'),
      description: t(
        'people.sections.mapDescription',
        'Explore public gathering places, queer neighbourhoods and events—or switch to the protected cruising map.',
      ),
      action: (
        <LocalizedLink to="/map" className="text-13 font-semibold no-underline hover:underline">
          {t('people.fullMap', 'Open full map')}
        </LocalizedLink>
      ),
      content: (
        <DeferredSection
          rootMargin="200px 0px"
          fallback={<Skeleton className="h-[clamp(22rem,58vh,32rem)] w-full" />}
        >
          <Suspense fallback={<Skeleton className="h-[clamp(22rem,58vh,32rem)] w-full" />}>
            <PeopleConnectionMap />
          </Suspense>
        </DeferredSection>
      ),
    },
  ];

  const title = cityName
    ? t('people.titleCity', { defaultValue: 'Meet people in {{city}}', city: cityName })
    : t('header.intents.meet.label', 'Meet people');

  return (
    <>
      <IntentPageLayout
        hideSectionNav
        breadcrumbLabel={t('header.intents.meet.label', 'Meet people')}
        breadcrumbHref="/hub/people"
        title={title}
        header={
          <>
            <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
              <header className="min-w-0">
                <h1 className="text-balance font-display text-display leading-tight md:text-hero rtl:font-sans rtl:font-bold">
                  {title}
                </h1>
                <p className="mt-2 max-w-[45ch] text-15 text-muted-foreground md:text-body-lg">
                  {t(
                    'people.intro',
                    'Find queer community spaces, groups and events, and meet people who share your interests.',
                  )}
                </p>
              </header>
              <PeopleDiscoveryLead spaces={spacesResult} groups={groups} events={eventsResult} />
            </div>
            <div className="mt-6 hidden md:block">
              <HubNav />
            </div>
          </>
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
    </>
  );
}

/** Signed-in only: the shared member grid, unfiltered. Filters live on /hub/members. */
function MemberDirectory() {
  const [filters, setFilters] = useState(defaultUserFilters);
  const { data: profiles, isLoading } = useUserDirectoryQuery({
    filters,
    nearMe: false,
    userLocation: null,
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  return (
    <UserDirectoryGrid
      profiles={profiles}
      filters={filters}
      setFilters={setFilters}
      activeFiltersCount={0}
      isAuthed
      clearAllFilters={() => setFilters(defaultUserFilters)}
    />
  );
}
