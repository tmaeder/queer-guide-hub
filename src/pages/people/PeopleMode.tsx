import { Suspense, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { lazyRetry } from '@/utils/lazyRetry';
import { IntentSheet } from '@/components/people/IntentSheet';
import { MeetMembersNotice } from '@/components/people/MeetMembersNotice';
import { PeopleModeView } from './PeopleModeView';
import { NearbyView } from './NearbyView';
import { PageContainer } from '@/components/layout/PageContainer';

// Dating keeps its own opt-in/age-walled deck; it self-gates when not opted in.
const IntimateDiscovery = lazyRetry(() => import('@/pages/intimate/IntimateDiscovery'));

export type PeopleTab = 'friends' | 'dating' | 'travel' | 'nearby';

const META: Record<
  PeopleTab,
  { title: string; description: string; labelKey: string; label: string }
> = {
  friends: {
    title: 'Find queer friends',
    description: 'Find LGBTQ+ friends who share your interests, groups and the places you go.',
    labelKey: 'people.tabs.friends',
    label: 'Friends',
  },
  dating: {
    title: 'Queer dating',
    description: 'An opt-in, age-verified dating space for LGBTQ+ members.',
    labelKey: 'people.tabs.dating',
    label: 'Dating',
  },
  travel: {
    title: 'Find travel buddies',
    description: 'Find LGBTQ+ travellers heading where you are heading.',
    labelKey: 'people.tabs.travel',
    label: 'Travel buddies',
  },
  nearby: {
    title: 'People nearby',
    description: 'See which LGBTQ+ members are nearby, with approximate, opt-in location.',
    labelKey: 'people.tabs.nearby',
    label: 'Nearby',
  },
};

/**
 * One of the four person-matching modes, on its own route.
 *
 * Split out of `People.tsx` when the hub became place-led. These stay real
 * routes rather than folding into `?section=` because they are deep-linked from
 * outside: `/intimate`, `/discover` and `/cruising` redirect to
 * `/people/dating`, TripTravelBuddiesCTA sends people to `/people/travel`, and
 * TravelBuddiesSection's "See all" points at the same. Turning them into query
 * params would 404 every one of those.
 *
 * Each mode carries its own title and description. Previously all four shared
 * the hub's meta, so `/people/dating` and `/people/nearby` were indistinguishable
 * to a crawler and to anyone reading a browser tab.
 */
export default function PeopleMode({ tab }: { tab: PeopleTab }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [intentOpen, setIntentOpen] = useState(false);

  const tripId = searchParams.get('tripId') ?? undefined;
  const cityId = searchParams.get('cityId') ?? undefined;
  const meta = META[tab];

  // useMeta already appends " | Queer Guide" — adding a suffix here renders it
  // twice.
  useMeta({
    title: meta.title,
    description: meta.description,
    canonicalPath: `/people/${tab}`,
  });

  return (
    <>
      {/* ONE container. This was two siblings, so the page paid
          `py-8 md:py-12` twice and opened with a doubled gap between the title
          block and its content that no other page on the site has. */}
      <PageContainer>
        <LocalizedLink
          to="/people"
          className="mb-4 inline-flex items-center gap-2 text-13 font-bold text-muted-foreground no-underline hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden />
          {t('people.backToHub', 'Meet people')}
        </LocalizedLink>

        {/* Was a bare `text-headline` h1 with no rule under it — the one place
            in the hub's subtree that read as an unstyled page. */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border-hairline pb-4">
          <h1 className="font-display text-display">{t(meta.labelKey, meta.label)}</h1>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            onClick={() => setIntentOpen(true)}
          >
            <SlidersHorizontal size={14} aria-hidden />
            {t('people.intent.button', "I'm here for…")}
          </Button>
        </div>

        <Suspense
          fallback={
            <div className="flex flex-col gap-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          }
        >
          {tab === 'friends' && (
            <PeopleModeView mode="friends" emptyState={<MeetMembersNotice />} />
          )}
          {tab === 'dating' && <IntimateDiscovery />}
          {tab === 'travel' && (
            <PeopleModeView
              mode="travel"
              tripId={tripId}
              cityId={cityId}
              emptyState={<MeetMembersNotice />}
            />
          )}
          {tab === 'nearby' && <NearbyView />}
        </Suspense>
      </PageContainer>

      <IntentSheet open={intentOpen} onOpenChange={setIntentOpen} />
    </>
  );
}
