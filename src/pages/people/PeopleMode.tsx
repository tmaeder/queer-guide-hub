import { Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { Skeleton } from '@/components/ui/skeleton';
import { VibeEditor } from '@/components/messaging/VibeEditor';
import { MeetMembersNotice } from '@/components/people/MeetMembersNotice';
import { PeopleModeView } from './PeopleModeView';
import { NearbyView } from './NearbyView';
import { MeetPageLayout } from '@/components/meet/MeetPageLayout';

// Dating keeps its own opt-in/age-walled deck; it self-gates when not opted in.

export type PeopleTab = 'travel' | 'nearby';

const META: Record<
  PeopleTab,
  { title: string; description: string; labelKey: string; label: string }
> = {
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
 * A person-matching mode (travel buddies, nearby), on its own route.
 *
 * Split out of `People.tsx` when the hub became place-led. These stay real
 * routes rather than folding into `?section=` because they are deep-linked from
 * outside: `/intimate`, `/discover` and `/cruising` redirect to
 * `/meet/dating`, TripTravelBuddiesCTA sends people to `/meet/travel`, and
 * TravelBuddiesSection's "See all" points at the same. Turning them into query
 * params would 404 every one of those.
 *
 * Each mode carries its own title and description. Previously all four shared
 * the hub's meta, so `/meet/dating` and `/meet/nearby` were indistinguishable
 * to a crawler and to anyone reading a browser tab.
 */
export default function PeopleMode({ tab }: { tab: PeopleTab }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const tripId = searchParams.get('tripId') ?? undefined;
  const cityId = searchParams.get('cityId') ?? undefined;
  const meta = META[tab];

  // useMeta already appends " | Queer Guide" — adding a suffix here renders it
  // twice.
  useMeta({
    title: meta.title,
    description: meta.description,
    canonicalPath: `/meet/${tab}`,
  });

  return (
    <>
      <MeetPageLayout
        title={t(meta.labelKey, meta.label)}
        description={meta.description}
        actions={
          // Mobile edits this from the Hub menu; desktop has no Hub menu.
          <div className="hidden md:block">
            <VibeEditor />
          </div>
        }
      >
        <Suspense
          fallback={
            <div className="flex flex-col gap-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          }
        >
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
      </MeetPageLayout>
    </>
  );
}
