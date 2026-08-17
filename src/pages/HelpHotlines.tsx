/**
 * HelpHotlines — crisis support hub at /help and /help/:country.
 *
 * Data flow:
 *   - cms_pages row slug='help' holds body_json.hotlines[]
 *   - Hotline shape is defined in src/types/cms.ts; ranking, open-now and
 *     channel helpers all live in src/components/help/helpData.ts so the page
 *     and the JSON-LD cannot drift apart again.
 *
 * Crisis UX invariants:
 *   - EmergencyBand and CrisisTriage render OUTSIDE the loading/error branch,
 *     so first paint always carries life-safety info even before i18n resolves
 *     or the CMS returns.
 *   - QuickExit (ESC) and HideScreen are the first things in the container.
 *   - Call-now lines and referral directories are rendered in different shapes,
 *     not just different sections (audit H-1).
 *   - The page is animation-free: no PageHeader (`.content-enter`), no
 *     PageHero, no scroll progress, no skeleton shimmer.
 *
 * SEO:
 *   - useMeta emits EmergencyService JSON-LD from selectPrimaryLine — the same
 *     function the visible CTA uses, over the same unfiltered, directory-free
 *     list. Previously these were two algorithms over two lists, so a keystroke
 *     in the search box rewrote the page's emergency structured data.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useMeta } from '@/hooks/useMeta';
import { useCMSPage } from '@/hooks/useCMSPage';
import { useAuth } from '@/hooks/useAuth';
import { useHotlineBookmarks } from '@/hooks/useHotlineBookmarks';
import { useGeoCountry } from '@/hooks/useGeoCountry';
import { useOrganizationsList } from '@/hooks/useOrganization';
import { PageContainer } from '@/components/layout/PageContainer';
import { QuickExit } from '@/components/safety/QuickExit';
import { HideScreen } from '@/components/safety/HideScreen';
import { EmergencyBand } from '@/components/help/EmergencyBand';
import { CrisisTriage } from '@/components/help/CrisisTriage';
import { HelpFilterSpine } from '@/components/help/HelpFilterSpine';
import { HotlineCard } from '@/components/help/HotlineCard';
import { DirectoryList } from '@/components/help/DirectoryList';
import { MoreSupportBand } from '@/components/help/MoreSupportBand';
import {
  COUNTRY_NAMES,
  countryLabel,
  isDirectory,
  is247,
  matchProfileLocation,
  selectPrimaryLine,
  sortByAvailability,
} from '@/components/help/helpData';
import type { Hotline } from '@/types/cms';

interface HelpBodyJson {
  hotlines?: Hotline[];
}

function buildEmergencyJsonLd(country: string, hero: Hotline | null): Record<string, unknown> {
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'EmergencyService',
    name: hero?.name ?? 'LGBTQIA+ Crisis Support',
    areaServed: country === 'ALL' || country === 'INT' ? 'Worldwide' : countryLabel(country),
  };
  if (hero?.phone) base.telephone = hero.phone;
  if (hero?.url) base.url = hero.url;
  if (hero && (hero.always_open ?? is247(hero.hours))) base.hoursAvailable = '24/7';
  return base;
}

export default function HelpHotlines() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { bookmarkedIds, isBookmarked, toggle: toggleBookmark } = useHotlineBookmarks();
  const params = useParams<{ country?: string }>();

  const initialCountry = useMemo(() => {
    const fromUrl = params.country?.toUpperCase();
    if (fromUrl && COUNTRY_NAMES[fromUrl]) return fromUrl;
    return matchProfileLocation(user?.user_metadata?.location as string | undefined);
  }, [params.country, user]);

  const geo = useGeoCountry(initialCountry);

  const [countryFilter, setCountryFilter] = useState<string>(geo.country);
  const [topicFilter, setTopicFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setCountryFilter(geo.country);
  }, [geo.country]);

  useEffect(() => {
    try {
      localStorage.setItem('qg_help_country', countryFilter);
    } catch {
      /* ignore */
    }
  }, [countryFilter]);

  const { data: cmsResult, isLoading } = useCMSPage('help');
  const page = cmsResult?.page ?? null;

  const hotlines: Hotline[] = useMemo(() => {
    const body = page?.body_json as HelpBodyJson | undefined;
    return Array.isArray(body?.hotlines) ? body.hotlines : [];
  }, [page]);

  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    hotlines.forEach((h) => set.add(h.country));
    return Array.from(set).sort((a, b) => {
      if (a === 'INT') return 1;
      if (b === 'INT') return -1;
      return countryLabel(a).localeCompare(countryLabel(b));
    });
  }, [hotlines]);

  const inScope = useMemo(
    () => hotlines.filter((h) => countryFilter === 'ALL' || h.country === countryFilter),
    [hotlines, countryFilter],
  );

  const availableTopics = useMemo(() => {
    const counts = new Map<string, number>();
    inScope.forEach((h) => h.topics.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1)));
    // Only topics with enough entries to be worth a chip; the long tail stays
    // reachable through search and the per-card chips.
    return Array.from(counts.entries())
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([topic]) => topic);
  }, [inScope]);

  const visible = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return inScope.filter((h) => {
      if (topicFilter !== 'ALL' && !h.topics.includes(topicFilter)) return false;
      if (q) {
        const haystack = `${h.name} ${h.description} ${h.languages.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [inScope, topicFilter, searchQuery]);

  const callNow = useMemo(
    () => sortByAvailability(visible.filter((h) => !isDirectory(h))),
    [visible],
  );
  const directories = useMemo(() => visible.filter(isDirectory), [visible]);

  // The ONE ranking, over the unfiltered list. Feeds both the CTA and the
  // JSON-LD, so a search keystroke can never rewrite the structured data.
  const hero = useMemo(() => selectPrimaryLine(hotlines, countryFilter), [hotlines, countryFilter]);

  const savedLines = useMemo(
    () => (bookmarkedIds.size === 0 ? [] : hotlines.filter((h) => bookmarkedIds.has(h.id))),
    [hotlines, bookmarkedIds],
  );

  const { data: supportOrgs = [] } = useOrganizationsList({
    role: 'support',
    countryCode: countryFilter,
    limit: 24,
  });

  useMeta({
    title: t('help.title', 'Help & Crisis Hotlines'),
    description: t(
      'help.meta_description',
      'Free, anonymous LGBTQIA+ crisis hotlines and counselling services worldwide. You are not alone.',
    ),
    canonicalPath: params.country ? `/help/${params.country.toLowerCase()}` : '/help',
    jsonLd: buildEmergencyJsonLd(countryFilter, hero),
  });

  const resetFilters = () => {
    setTopicFilter('ALL');
    setSearchQuery('');
  };

  return (
    <PageContainer>
      <QuickExit />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <HideScreen />
      </div>

      <EmergencyBand />

      <div className="mt-8">
        <CrisisTriage
          hotlines={hotlines}
          hero={hero}
          country={countryFilter}
          availableCountries={availableCountries}
          onCountryChange={setCountryFilter}
          savedLines={savedLines}
        />
      </div>

      {/* The seam. Everything above answers "what do I do now"; everything
          below is for browsing, and the rule says so out loud. */}
      <section className="mt-12 border-t border-border-hairline pt-8" aria-labelledby="help-browse">
        <h2 id="help-browse" className="font-display text-display leading-tight">
          {t('help.browse_title', 'Browse every line')}
        </h2>

        <HelpFilterSpine
          search={searchQuery}
          onSearch={setSearchQuery}
          topics={availableTopics}
          topic={topicFilter}
          onTopic={setTopicFilter}
          resultCount={callNow.length + directories.length}
          totalCount={inScope.length}
          onReset={resetFilters}
        />

        {isLoading && hotlines.length === 0 ? (
          <p className="mt-6 text-15 text-muted-foreground">
            {t('help.loading', 'Loading the directory…')}
          </p>
        ) : callNow.length === 0 && directories.length === 0 ? (
          <div className="mt-6 bg-muted rounded-container p-6">
            <h3 className="text-title font-bold leading-tight">
              {t('help.no_results_title', 'No lines match these filters')}
            </h3>
            <p className="mt-2 text-15 leading-relaxed text-muted-foreground">
              {t(
                'help.no_results',
                'Try all countries, or check the international directories. In acute danger, call 112 (EU) or 911 (US/CA).',
              )}
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 px-4 py-2 text-13 font-bold transition-colors hover:bg-foreground hover:text-background"
            >
              {t('help.reset_filters', 'Reset filters')}
            </button>
          </div>
        ) : (
          <>
            {callNow.length > 0 && (
              <ul className="m-0 mt-6 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2">
                {callNow.map((h) => (
                  <li key={h.id}>
                    <HotlineCard
                      hotline={h}
                      isKept={isBookmarked(h.id)}
                      toggleKeep={toggleBookmark}
                      showCountry={countryFilter === 'ALL'}
                    />
                  </li>
                ))}
              </ul>
            )}

            {directories.length > 0 && (
              <div className="mt-10">
                <h3 className="font-display text-headline leading-tight">
                  {t('help.directories_title', 'Directories & further support')}
                </h3>
                <p className="mb-4 mt-2 max-w-prose text-15 text-muted-foreground">
                  {t(
                    'help.directories_subtitle',
                    'These are referral organisations and directories — websites rather than direct phone lines.',
                  )}
                </p>
                <DirectoryList directories={directories} />
              </div>
            )}
          </>
        )}
      </section>

      <MoreSupportBand orgs={supportOrgs} />

      <p className="mt-12 border-t border-border-hairline pt-6 text-13 text-muted-foreground">
        {t('help.disclaimer', 'Queer Guide does not replace professional help.')}
      </p>
    </PageContainer>
  );
}
