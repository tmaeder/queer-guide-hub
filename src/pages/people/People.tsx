import { Suspense, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Heart, Users, Plane, MapPin, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useProfile } from '@/hooks/useProfile';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { lazyRetry } from '@/utils/lazyRetry';
import { IntentSheet } from '@/components/people/IntentSheet';
import { PeopleModeView } from './PeopleModeView';

// Dating keeps its own opt-in/age-walled deck; it self-gates when not opted in.
const IntimateDiscovery = lazyRetry(() => import('@/pages/intimate/IntimateDiscovery'));

const TABS = ['friends', 'dating', 'travel', 'nearby'] as const;
type PeopleTab = (typeof TABS)[number];

/** Map the soft profile.user_mode to the tab that opens first. */
function defaultTabFor(userMode: string | null | undefined): PeopleTab {
  switch (userMode) {
    case 'dating':
      return 'dating';
    case 'exploration':
      return 'travel';
    case 'fun':
      return 'nearby';
    default:
      return 'friends';
  }
}

/**
 * People hub — the unified discovery surface. One shell, mode tabs, all ranked
 * by the shared matching engine. Friends / travel / nearby read public-safe
 * profiles; dating forks to the walled intimate deck. user_mode is a soft
 * default for which tab opens first, never a hard filter.
 */
export default function People({ tab }: { tab?: PeopleTab }) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { profile } = useProfile();
  const [searchParams] = useSearchParams();
  const [intentOpen, setIntentOpen] = useState(false);

  const tripId = searchParams.get('tripId') ?? undefined;
  const cityId = searchParams.get('cityId') ?? undefined;
  const showNudge = profile != null && !profile.user_mode;

  const fallback = defaultTabFor(profile?.user_mode as string | null | undefined);
  const active: PeopleTab = (TABS as readonly string[]).includes(tab ?? '')
    ? (tab as PeopleTab)
    : fallback;

  const setTab = (v: string) => navigate(v === fallback ? '/people' : `/people/${v}`);

  const triggers: ReadonlyArray<readonly [PeopleTab, string, LucideIcon]> = [
    ['friends', t('people.tabs.friends', 'Friends'), Users],
    ['dating', t('people.tabs.dating', 'Dating'), Heart],
    ['travel', t('people.tabs.travel', 'Travel buddies'), Plane],
    ['nearby', t('people.tabs.nearby', 'Nearby'), MapPin],
  ];

  return (
    <>
      <div className="container mx-auto px-4 pt-6">
        <div className="flex items-end justify-between gap-4">
          <Tabs value={active} onValueChange={setTab} style={{ width: '100%' }}>
            <TabsList className="h-auto gap-0 rounded-none border-0 border-b border-border bg-transparent p-0 backdrop-blur-none w-full justify-start overflow-x-auto">
              {triggers.map(([v, label, Icon]) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className="h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-foreground data-[state=active]:shadow-none flex items-center gap-2"
                >
                  <Icon size={16} aria-hidden />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            className="mb-2 shrink-0 gap-2"
            onClick={() => setIntentOpen(true)}
          >
            <SlidersHorizontal size={14} aria-hidden />
            <span className="hidden sm:inline">{t('people.intent.button', "I'm here for…")}</span>
          </Button>
        </div>

        {showNudge && (
          <button
            type="button"
            onClick={() => setIntentOpen(true)}
            className="mt-4 flex w-full items-center gap-2 rounded-element border border-border px-4 py-2.5 text-left text-sm transition-colors hover:border-foreground"
          >
            {t('people.intent.nudge', 'Tell us what you’re here for so we can rank people for you.')}
          </button>
        )}
      </div>

      <div className="container mx-auto px-4 py-8">
        <Suspense
          fallback={
            <div className="flex flex-col gap-4">
              <Skeleton className="h-32 rounded-container" />
              <Skeleton className="h-32 rounded-container" />
            </div>
          }
        >
          {active === 'friends' && (
            <PeopleModeView
              mode="friends"
              emptyHint={t('people.empty.friends', 'No one to suggest yet. Check back as the community grows.')}
            />
          )}
          {active === 'dating' && <IntimateDiscovery />}
          {active === 'travel' && (
            <PeopleModeView
              mode="travel"
              tripId={tripId}
              cityId={cityId}
              emptyHint={t(
                'people.empty.travel',
                'No travelers to show. Set a travel city in your status so others heading there can find you.',
              )}
            />
          )}
          {active === 'nearby' && (
            <PeopleModeView
              mode="locals"
              cityId={cityId}
              emptyHint={t('people.empty.nearby', 'No one nearby yet.')}
            />
          )}
        </Suspense>
      </div>

      <IntentSheet open={intentOpen} onOpenChange={setIntentOpen} />
    </>
  );
}
