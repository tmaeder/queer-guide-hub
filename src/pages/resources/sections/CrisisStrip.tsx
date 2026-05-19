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

interface Hotline {
  id: string;
  name: string;
  country: string;
  phone: string | null;
  url?: string;
  topics: string[];
  languages: string[];
  hours: string;
  description: string;
  free?: boolean;
  anonymous?: boolean;
}

const EMERGENCY_NUMBERS: Record<string, string> = {
  DE: '112', AT: '112', CH: '112', GB: '999', IE: '112',
  US: '911', CA: '911', AU: '000', NL: '112', FR: '112',
  ES: '112', IT: '112', INT: '112 / 911',
};

const MAX = 4;

function is247(hours: string): boolean {
  const h = hours.toLowerCase();
  return h.includes('24/7') || h.includes('24 h') || h.includes('rund um die uhr');
}

function rankHotlines(list: Hotline[]): Hotline[] {
  return [...list].sort((a, b) => {
    const a247 = is247(a.hours) ? 1 : 0;
    const b247 = is247(b.hours) ? 1 : 0;
    if (b247 !== a247) return b247 - a247;
    const aFree = a.free ? 1 : 0;
    const bFree = b.free ? 1 : 0;
    if (bFree !== aFree) return bFree - aFree;
    return b.topics.length - a.topics.length;
  });
}

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
    const local = hotlines.filter((h) => h.country === country);
    const international = hotlines.filter((h) => h.country === 'INT');
    const combined = local.length > 0 ? [...rankHotlines(local), ...rankHotlines(international)] : rankHotlines(international);
    return combined.slice(0, MAX);
  }, [hotlines, country]);

  const showNoLocalNote = !isLoading && country !== 'INT' && localCount === 0 && hotlines.length > 0;

  const emergency = EMERGENCY_NUMBERS[country] ?? EMERGENCY_NUMBERS.INT;

  return (
    <section aria-labelledby="crisis-heading" className="rounded-container bg-foreground/[0.03] border border-border/60 p-5 sm:p-6">
      <header className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle aria-hidden style={{ width: 18, height: 18 }} />
          <h2 id="crisis-heading" className="text-base font-semibold">{t('resources.crisis.heading')}</h2>
        </div>
        <Badge variant="secondary" className="text-[0.7rem]">{t('resources.crisis.badge')}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="h-8 w-[170px] text-xs" aria-label={t('resources.crisis.chooseCountryAria')}>
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
        <a href={`tel:${emergency.split(' ')[0]}`} className="font-semibold text-foreground underline">{emergency}</a>
        {country !== 'INT'
          ? t('resources.crisis.callEmergencySuffix', { country: countryLabel(country) })
          : t('resources.crisis.callEmergencySuffixInt')}
      </p>

      {showNoLocalNote && (
        <p className="text-xs text-muted-foreground mb-3">
          {t('resources.crisis.noLocal', { country: countryLabel(country) })}
        </p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-element" />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('resources.crisis.noHotlinesLoaded')}</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label={t('resources.crisis.listAria')}>
          {visible.map((h) => (
            <li key={h.id}>
              <Card className="p-4 h-full flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm leading-tight">{h.name}</p>
                  <Badge variant="outline" className="shrink-0 text-[0.65rem]">{countryLabel(h.country)}</Badge>
                </div>
                {h.phone && (
                  <a
                    href={`tel:${h.phone.replace(/\s+/g, '')}`}
                    aria-label={t('resources.crisis.callAria', { name: h.name, phone: h.phone })}
                    className="inline-flex items-center gap-2 text-xl font-semibold tabular-nums text-foreground hover:underline -mx-1 px-1 py-0.5"
                  >
                    <Phone aria-hidden style={{ width: 18, height: 18 }} />
                    {h.phone}
                  </a>
                )}
                <div className="flex flex-wrap gap-2 text-[0.7rem] text-muted-foreground mt-auto">
                  {h.hours && (
                    <span className="inline-flex items-center gap-1">
                      <Clock aria-hidden style={{ width: 12, height: 12 }} />
                      {h.hours}
                    </span>
                  )}
                  {h.languages?.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Languages aria-hidden style={{ width: 12, height: 12 }} />
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
        <ChevronRight aria-hidden style={{ width: 14, height: 14 }} />
      </LocalizedLink>
    </section>
  );
}
