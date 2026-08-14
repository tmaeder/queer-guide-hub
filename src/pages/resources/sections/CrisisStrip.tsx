/**
 * CrisisStrip — Urgency-first section at the top of /resources.
 *
 * Pulls the curated hotline list from cms_pages slug='help' (same source as
 * /help), narrows to the user's country, and surfaces the top 4–6 lines plus
 * a country-aware emergency-number row and a link to the full /help page.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useCMSPage } from '@/hooks/useCMSPage';
import { useUserCountry, SUPPORTED_COUNTRIES, countryLabel } from '@/hooks/useUserCountry';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Phone, Clock, Languages, AlertTriangle, ChevronRight } from 'lucide-react';

// Imported rather than re-declared. This file used to carry its own copy of
// the shape, which silently went stale every time the canonical one gained a
// field — it never learned about `kind`, so directories were eligible for a
// strip whose entire premise is a phone number.
import type { Hotline } from '@/types/cms';
// Ranking is imported for the same reason the type is. This file used to carry
// its own `is247` (a substring match over free text) and its own `rankHotlines`
// (24/7 → free → topic count), so /resources and /help could recommend
// different lines from one corpus — and the local copy could not see
// `hours_slots`, so it had no notion of whether a line was open *now*.
// `sortByAvailability` is the same triage /help applies: reachable now first,
// unknown ahead of known-closed, never a line that may call the police.
import { isDirectory, sortByAvailability } from '@/components/help/helpData';

const EMERGENCY_NUMBERS: Record<string, string> = {
  DE: '112',
  AT: '112',
  CH: '112',
  GB: '999',
  IE: '112',
  US: '911',
  CA: '911',
  AU: '000',
  NL: '112',
  FR: '112',
  ES: '112',
  IT: '112',
  INT: '112 / 911',
};

const MAX = 4;

export function CrisisStrip() {
  const { t } = useTranslation();
  const { data: cms, isLoading } = useCMSPage('help');
  const { country, setCountry } = useUserCountry();

  const hotlines = useMemo<Hotline[]>(() => {
    const body = cms?.page?.body_json as { hotlines?: Hotline[] } | undefined;
    return Array.isArray(body?.hotlines) ? body!.hotlines! : [];
  }, [cms]);

  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    hotlines.forEach((h) => set.add(h.country));
    return Array.from(set)
      .filter((c) => SUPPORTED_COUNTRIES[c])
      .sort((a, b) => {
        if (a === 'INT') return 1;
        if (b === 'INT') return -1;
        return countryLabel(a).localeCompare(countryLabel(b));
      });
  }, [hotlines]);

  const localCount = useMemo(
    () => hotlines.filter((h) => h.country === country).length,
    [hotlines, country],
  );

  const visible = useMemo(() => {
    // This strip exists to put a dialable number in front of someone in a
    // hurry, and it renders no alternative channels — so an entry with no
    // phone is a dead row here. Several are legitimately phone-less (LGBT
    // YouthLine retired its line in 2023; LSVD and TGNS route to email and
    // regional services), and those belong on /help, which shows their text,
    // chat and email routes properly. Directories never belonged here at all.
    const callable = hotlines.filter((h) => !!h.phone && !isDirectory(h));
    const local = callable.filter((h) => h.country === country);
    const international = callable.filter((h) => h.country === 'INT');
    const combined =
      local.length > 0
        ? [...sortByAvailability(local), ...sortByAvailability(international)]
        : sortByAvailability(international);
    return combined.slice(0, MAX);
  }, [hotlines, country]);

  const showNoLocalNote =
    !isLoading && country !== 'INT' && localCount === 0 && hotlines.length > 0;

  const emergency = EMERGENCY_NUMBERS[country] ?? EMERGENCY_NUMBERS.INT;

  return (
    <section
      aria-labelledby="crisis-heading"
      className="rounded-container bg-foreground/[0.03] p-6 sm:p-6"
    >
      <header className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle aria-hidden size={18} />
          <h2 id="crisis-heading" className="text-base font-semibold">
            {t('resources.crisis.heading')}
          </h2>
        </div>
        <Badge variant="secondary" className="text-xs2">
          {t('resources.crisis.badge')}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger
              className="h-8 w-full sm:w-[170px] text-xs"
              aria-label={t('resources.crisis.chooseCountryAria')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableCountries.length > 0
                ? availableCountries.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {countryLabel(c)}
                    </SelectItem>
                  ))
                : Object.keys(SUPPORTED_COUNTRIES).map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {countryLabel(c)}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <p className="text-sm text-muted-foreground mb-4">
        {t('resources.crisis.callEmergencyPrefix')}
        <a
          href={`tel:${emergency.split(' ')[0]}`}
          className="font-semibold text-foreground underline"
        >
          {emergency}
        </a>
        {country !== 'INT'
          ? t('resources.crisis.callEmergencySuffix', { country: countryLabel(country) })
          : t('resources.crisis.callEmergencySuffixInt')}
      </p>

      {showNoLocalNote && (
        <p className="text-xs text-muted-foreground mb-4">
          {t('resources.crisis.noLocal', { country: countryLabel(country) })}
        </p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Static placeholders. /resources is not one of the routes the design
              system lists as a crisis surface, but this block is a crisis strip
              wherever it sits, and a pulsing shimmer is the one animation a
              reader in distress reads as the page still deciding something. */}
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} animation={false} className="h-24 w-full rounded-element" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('resources.crisis.noHotlinesLoaded')}</p>
      ) : (
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          aria-label={t('resources.crisis.listAria')}
        >
          {visible.map((h) => (
            <li key={h.id}>
              <Card className="p-4 h-full flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm leading-tight">{h.name}</p>
                  <Badge variant="outline" className="shrink-0 text-2xs">
                    {countryLabel(h.country)}
                  </Badge>
                </div>
                {h.phone && (
                  <a
                    href={`tel:${h.phone.replace(/\s+/g, '')}`}
                    aria-label={t('resources.crisis.callAria', { name: h.name, phone: h.phone })}
                    className="inline-flex items-center gap-2 text-xl font-semibold tabular-nums text-foreground hover:underline -mx-1 px-1 py-0.5"
                  >
                    <Phone aria-hidden size={18} />
                    {h.phone}
                  </a>
                )}
                <div className="flex flex-wrap gap-2 text-xs2 text-muted-foreground mt-auto">
                  {h.hours && (
                    <span className="inline-flex items-center gap-1">
                      <Clock aria-hidden size={12} />
                      {h.hours}
                    </span>
                  )}
                  {h.languages?.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Languages aria-hidden size={12} />
                      {h.languages.join(', ')}
                    </span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <LocalizedLink
        to="/help"
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium hover:underline"
      >
        {t('resources.crisis.seeAll')}
        <ChevronRight aria-hidden size={14} />
      </LocalizedLink>
    </section>
  );
}
