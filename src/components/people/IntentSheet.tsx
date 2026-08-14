import { useTranslation } from 'react-i18next';
import { Plane } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { USER_MODES } from '@/config/navigation';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useUserIntent, useDerivedTravelIntent } from '@/hooks/useUserIntent';
import { IntentChips } from '@/components/status/IntentChips';

/** Both branches set a `border-*` COLOUR and neither ever set a border WIDTH,
 *  so the border they were selecting between never rendered at all — the
 *  active and inactive chips differed only by fill. */
const chip = (active: boolean) =>
  cn(
    'inline-flex shrink-0 cursor-pointer items-center gap-1.5 border-2 border-foreground px-2.5 py-2 text-13 font-bold transition-colors',
    active ? 'bg-foreground text-background' : 'bg-background hover:bg-surface-container',
  );

/**
 * Intent capture for the People hub. One sheet sets the three signals the
 * matching engine already reads — mode, what you're looking for, and the city
 * you're heading to. Travel is offered straight from your next trip so you
 * never re-type a destination.
 */
export function IntentSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { mode, setMode, travel, setTravel } = useUserIntent();
  const { data: derived } = useDerivedTravelIntent(open);

  const travelCityActive = travel?.city_id ?? travel?.city_name;

  const useTrip = async () => {
    if (!derived) return;
    await setTravel({
      city_id: derived.cityId ?? undefined,
      city_name: derived.cityName ?? undefined,
      until: derived.endDate ?? undefined,
    });
    onOpenChange(false);
    navigate(`/people/travel?tripId=${derived.tripId}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto px-4 pb-8 sm:px-6">
        <SheetHeader className="text-left">
          <SheetTitle>{t('people.intent.title', 'What are you here for?')}</SheetTitle>
          <SheetDescription>
            {t('people.intent.subtitle', 'Sets how we rank people for you. Change it anytime.')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-8">
          <section>
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {t('people.intent.mode', 'Mode')}
            </h3>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {USER_MODES.map((m) => {
                const Icon = m.icon;
                const active = mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(m.value)}
                    className={chip(active)}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    <span className="whitespace-nowrap">{t(m.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {t('people.intent.lookingFor', "What you're looking for")}
            </h3>
            <IntentChips />
          </section>

          <section>
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {t('people.intent.travel', 'Travel')}
            </h3>
            {travelCityActive ? (
              <div className="flex items-center justify-between gap-4 border-2 border-foreground px-4 py-2 bg-background">
                <span className="flex items-center gap-2 text-sm">
                  <Plane className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {t('people.intent.travelActive', {
                    defaultValue: 'Visible to people in {{city}}',
                    city: travel?.city_name ?? t('people.intent.yourCity', 'your destination'),
                  })}
                </span>
                <Button variant="outline" size="sm" onClick={() => setTravel(null)}>
                  {t('common.clear', 'Clear')}
                </Button>
              </div>
            ) : derived?.cityName ? (
              <button
                type="button"
                onClick={useTrip}
                className="flex w-full items-center gap-2 border-2 border-foreground bg-background px-4 py-2 text-left transition-colors hover:bg-surface-container"
              >
                <Plane className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-sm">
                  {t('people.intent.travelSuggest', {
                    defaultValue: 'Heading to {{city}} — let others going there find you',
                    city: derived.cityName,
                  })}
                </span>
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  'people.intent.travelEmpty',
                  'Plan a trip to find travel buddies heading to the same place.',
                )}
              </p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
