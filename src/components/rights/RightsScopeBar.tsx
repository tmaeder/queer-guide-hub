import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { deathPenaltyRisk, hasAnyCriminalizationSignal } from '@/utils/equalityScore';
import { scrollToIdSettled } from '@/lib/scrollSettle';
import type { RightsCountry } from '@/hooks/useIntentData';

/**
 * The split band under the /rights hero: check ONE place fast (combobox +
 * geolocated one-liner) beside the state of the world (three headline stats).
 * Absorbs the former "Where you are" section.
 *
 * Crisis-adjacent surface: no animation, no track colors; --destructive is
 * allowed on the death-penalty figure only (locked functional exception).
 */

export interface RightsHeadlineStats {
  criminalising: number;
  deathConfirmed: number;
  marriage: number;
}

export function RightsScopeBar({
  countries,
  here,
  stats,
  onShowCriminalising,
}: {
  countries: RightsCountry[];
  here: RightsCountry | null;
  stats: RightsHeadlineStats;
  /** Preset the country table ('criminalising' | 'death') and scroll to it. */
  onShowCriminalising: (filter: 'criminalising' | 'death') => void;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useLocalizedNavigate();

  const hereRisk = here ? deathPenaltyRisk(here.lgbti_criminalization) : 'none';
  const hereVerdict = !here
    ? null
    : hereRisk === 'confirmed'
      ? 'same-sex acts can carry the death penalty'
      : hereRisk === 'possible'
        ? 'same-sex acts are criminalised; the death penalty may apply'
        : hasAnyCriminalizationSignal(here.lgbti_criminalization)
          ? 'same-sex acts are criminalised'
          : 'same-sex acts are not criminalised';

  return (
    <div className="grid gap-8 md:grid-cols-2 md:items-start">
      <div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label="Check a country"
              className="h-10 w-full max-w-sm justify-between rounded-element px-4 py-2 font-normal text-muted-foreground"
            >
              Check a country…
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Country name…" />
              <CommandList>
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandGroup>
                  {countries
                    .filter((c) => c.slug)
                    .map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.name}
                        onSelect={() => {
                          setOpen(false);
                          navigate(`/country/${c.slug}`);
                        }}
                      >
                        {c.name}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <p className="mt-4 text-13 text-muted-foreground">
          {here ? (
            <>
              You’re in <span className="font-medium text-foreground">{here.name}</span> —{' '}
              {hereVerdict}
              {here.equality_score != null ? ` · ${here.equality_score}/100` : null}
              {here.slug ? (
                <>
                  {' · '}
                  <LocalizedLink
                    to={`/country/${here.slug}`}
                    className="underline underline-offset-4"
                  >
                    full legal detail
                  </LocalizedLink>
                </>
              ) : null}
            </>
          ) : (
            'We could not determine your country from your connection. Pick any country for its full legal profile.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onShowCriminalising('criminalising')}
          className="text-left"
        >
          <span className="font-display text-display m-0 block">{stats.criminalising}</span>
          <span className="text-13 text-muted-foreground block">countries criminalise</span>
        </button>
        <button type="button" onClick={() => onShowCriminalising('death')} className="text-left">
          <span className="font-display text-display m-0 block text-destructive">
            {stats.deathConfirmed}
          </span>
          <span className="text-13 text-muted-foreground block">with the death penalty</span>
        </button>
        <a
          href="#marriage"
          onClick={() => scrollToIdSettled('marriage')}
          className="no-underline text-left block"
        >
          <span className="font-display text-display m-0 block">{stats.marriage}</span>
          <span className="text-13 text-muted-foreground block">have marriage equality</span>
        </a>
      </div>
    </div>
  );
}

export default RightsScopeBar;
