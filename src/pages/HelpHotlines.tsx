/**
 * HelpHotlines — Crisis support hub at /help and /help/:country.
 *
 * Data flow:
 *   - cms_pages row slug='help' holds body_html (intro) + body_json.hotlines[]
 *   - Hotline shape is defined in src/types/cms.ts (extended with channels,
 *     intersections, what_to_expect, verified_at, operator, affiliation,
 *     reports_to_police, source_url).
 *
 * Crisis UX:
 *   - Emergency banner + the per-country hero CTA render synchronously
 *     (with static fallbacks) so first paint always shows life-safety info,
 *     even before i18n is ready or CMS has returned.
 *   - QuickExit (ESC) + HideScreen always visible.
 *   - HeroCTA picks the country's best 24/7 free hotline and exposes
 *     non-voice channels (text/chat/whatsapp/email) at equal weight.
 *   - SelfHelpDrawer offers grounding while-you-wait.
 *
 * SEO:
 *   - useMeta emits EmergencyService JSON-LD.
 *   - /help/:country gives per-country landing pages for search-engine surfacing.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Phone,
  ExternalLink,
  Clock,
  Languages,
  AlertTriangle,
  Search,
  Heart,
  ChevronRight,
  Shield,
  EyeOff,
  Zap,
  MessageSquare,
  MessageCircle,
  Mail,
  Globe,
  ShieldAlert,
  BadgeCheck,
} from 'lucide-react';
import DOMPurify from 'dompurify';

import { useMeta } from '@/hooks/useMeta';
import { useCMSPage } from '@/hooks/useCMSPage';
import { useAuth } from '@/hooks/useAuth';
import { useHotlineBookmarks } from '@/hooks/useHotlineBookmarks';
import { useGeoCountry } from '@/hooks/useGeoCountry';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QuickExit } from '@/components/safety/QuickExit';
import { HideScreen } from '@/components/safety/HideScreen';
import { HeroCTA } from '@/components/help/HeroCTA';
import { WhatToExpect } from '@/components/help/WhatToExpect';
import { SelfHelpDrawer } from '@/components/help/SelfHelpDrawer';
import { ReportHotline } from '@/components/help/ReportHotline';
import type { CMSPage, Hotline, HotlineChannel } from '@/types/cms';

interface HelpBodyJson {
  hotlines?: Hotline[];
}

const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Deutschland',
  AT: 'Österreich',
  CH: 'Schweiz',
  GB: 'United Kingdom',
  IE: 'Ireland',
  US: 'United States',
  CA: 'Canada',
  AU: 'Australia',
  NL: 'Nederland',
  FR: 'France',
  ES: 'España',
  IT: 'Italia',
  INT: 'International',
};

/** Map hotline topic slugs to resource category URL params */
const TOPIC_TO_RESOURCE: Record<string, string> = {
  crisis: 'Mental Health',
  suicide: 'Mental Health',
  lgbtq: 'Identity & Expression',
  trans: 'Gender Identity',
  youth: 'Support Services & NGOs',
  health: 'Health & Wellness',
  hiv: 'Sexual Health',
  violence: 'Safety & Practices',
  discrimination: 'Rights & Activism',
  legal: 'Legal Rights',
  relationships: 'Relationships & Connection',
  'coming-out': 'Questioning & Labels',
  women: 'Identity & Expression',
};

const CHANNEL_ICON: Record<HotlineChannel['kind'], typeof Phone> = {
  phone: Phone,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  chat: Globe,
  email: Mail,
};

function channelHref(c: HotlineChannel): string {
  switch (c.kind) {
    case 'phone':
    case 'sms':
      return `${c.kind === 'phone' ? 'tel' : 'sms'}:${c.value.replace(/\s+/g, '')}`;
    case 'email':
      return `mailto:${c.value}`;
    case 'whatsapp':
      return c.value.startsWith('http')
        ? c.value
        : `https://wa.me/${c.value.replace(/[^\d]/g, '')}`;
    case 'chat':
      return c.value;
  }
}

function countryLabel(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

function matchProfileLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const lower = location.toLowerCase();
  for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
    if (lower.includes(name.toLowerCase()) || lower.includes(code.toLowerCase())) return code;
  }
  return null;
}

function is247(hours: string): boolean {
  const h = hours.toLowerCase();
  return h.includes('24/7') || h.includes('24 h') || h.includes('rund um die uhr');
}

const INTRO_HTML_CSS = `
.qg-help-intro p { font-size: 1rem; line-height: 1.7; margin-bottom: 0.75rem; }
.qg-help-intro strong { font-weight: 700; }
.qg-help-intro a { color: hsl(var(--primary)); text-decoration: underline; }
.qg-help-intro hr { border-color: hsl(var(--border)); margin: 1rem 0; }
.qg-help-intro em { color: hsl(var(--muted-foreground)); }
`;

function buildEmergencyJsonLd(country: string, hero: Hotline | null): Record<string, unknown> {
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'EmergencyService',
    name: hero?.name ?? 'LGBTQIA+ Crisis Support',
    areaServed: country === 'ALL' || country === 'INT' ? 'Worldwide' : countryLabel(country),
  };
  if (hero?.phone) base.telephone = hero.phone;
  if (hero?.url) base.url = hero.url;
  if (hero && is247(hero.hours)) {
    base.hoursAvailable = '24/7';
  }
  return base;
}

export default function HelpHotlines() {
  const { t, ready } = useTranslation();
  const { user } = useAuth();
  const { bookmarkedIds, isBookmarked, toggle: toggleBookmark } = useHotlineBookmarks();
  const params = useParams<{ country?: string }>();

  const initialCountry = useMemo(() => {
    const fromUrl = params.country?.toUpperCase();
    if (fromUrl && COUNTRY_NAMES[fromUrl]) return fromUrl;
    return matchProfileLocation(user?.user_metadata?.location as string | undefined);
  }, [params.country, user]);

  const geo = useGeoCountry(initialCountry);

  const [page, setPage] = useState<CMSPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [countryFilter, setCountryFilter] = useState<string>(geo.country);
  const [topicFilter, setTopicFilter] = useState<string>('ALL');
  const [intersectionFilter, setIntersectionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Keep country state in sync with geo resolution.
  useEffect(() => {
    setCountryFilter(geo.country);
  }, [geo.country]);

  // Persist filters
  useEffect(() => {
    try {
      localStorage.setItem('qg_help_country', countryFilter);
    } catch {
      /* ignore */
    }
  }, [countryFilter]);
  useEffect(() => {
    try {
      localStorage.setItem('qg_help_topic', topicFilter);
    } catch {
      /* ignore */
    }
  }, [topicFilter]);

  const { data: cmsResult, isLoading: cmsLoading } = useCMSPage('help');
  useEffect(() => {
    setLoading(cmsLoading);
    if (!cmsResult) return;
    if (cmsResult.notFound || !cmsResult.page) {
      setError(true);
    } else {
      setPage(cmsResult.page);
      setError(false);
    }
  }, [cmsLoading, cmsResult]);

  const hotlines: Hotline[] = useMemo(() => {
    const body = page?.body_json as HelpBodyJson | undefined;
    return Array.isArray(body?.hotlines) ? body!.hotlines! : [];
  }, [page]);

  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    hotlines.forEach((h) => set.add(h.country));
    const list = Array.from(set);
    list.sort((a, b) => {
      if (a === 'INT') return 1;
      if (b === 'INT') return -1;
      return countryLabel(a).localeCompare(countryLabel(b));
    });
    return list;
  }, [hotlines]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    hotlines.forEach((h) => h.topics.forEach((x) => set.add(x)));
    return Array.from(set).sort();
  }, [hotlines]);

  const availableIntersections = useMemo(() => {
    const set = new Set<string>();
    hotlines.forEach((h) => h.intersections?.forEach((x) => set.add(x)));
    return Array.from(set).sort();
  }, [hotlines]);

  const visibleHotlines = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return hotlines.filter((h) => {
      if (countryFilter !== 'ALL' && h.country !== countryFilter) return false;
      if (topicFilter !== 'ALL' && !h.topics.includes(topicFilter)) return false;
      if (
        intersectionFilter !== 'ALL' &&
        !(h.intersections ?? []).includes(intersectionFilter)
      )
        return false;
      if (q) {
        const haystack = `${h.name} ${h.description} ${h.languages.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [hotlines, countryFilter, topicFilter, intersectionFilter, searchQuery]);

  const bookmarkedHotlines = useMemo(() => {
    if (bookmarkedIds.size === 0) return [];
    return hotlines.filter((h) => bookmarkedIds.has(h.id));
  }, [hotlines, bookmarkedIds]);

  const heroHotline = useMemo<Hotline | null>(() => {
    if (countryFilter === 'ALL') return null;
    const inCountry = visibleHotlines.filter((h) => h.country === countryFilter);
    if (inCountry.length === 0) return null;
    return [...inCountry].sort((a, b) => {
      const a247 = is247(a.hours) ? 1 : 0;
      const b247 = is247(b.hours) ? 1 : 0;
      if (b247 !== a247) return b247 - a247;
      const aFree = a.free ? 1 : 0;
      const bFree = b.free ? 1 : 0;
      if (bFree !== aFree) return bFree - aFree;
      return b.topics.length - a.topics.length;
    })[0];
  }, [visibleHotlines, countryFilter]);

  const sanitizedIntroHtml = useMemo(
    () => (page?.body_html ? DOMPurify.sanitize(page.body_html) : ''),
    [page],
  );

  useMeta({
    title: t('help.title', 'Help & Crisis Hotlines'),
    description: t(
      'help.meta_description',
      'Free, anonymous LGBTQIA+ crisis hotlines and counselling services worldwide. You are not alone.',
    ),
    canonicalPath: params.country
      ? `/help/${params.country.toLowerCase()}`
      : '/help',
    jsonLd: buildEmergencyJsonLd(countryFilter, heroHotline),
  });

  const resetFilters = () => {
    setCountryFilter('ALL');
    setTopicFilter('ALL');
    setIntersectionFilter('ALL');
    setSearchQuery('');
  };

  return (
    <div className="mx-auto w-full max-w-screen-lg px-4 py-8 sm:px-6">
      <style dangerouslySetInnerHTML={{ __html: INTRO_HTML_CSS }} />

      <QuickExit />

      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-1">
        <LocalizedLink
          to="/resources"
          className="text-sm text-muted-foreground no-underline hover:opacity-70"
        >
          {t('help.breadcrumb_resources', 'Resources')}
        </LocalizedLink>
        <ChevronRight size={14} style={{ opacity: 0.5 }} />
        <LocalizedLink
          to="/resources?category=Support+%26+News"
          className="text-sm text-muted-foreground no-underline hover:opacity-70"
        >
          {t('help.breadcrumb_support', 'Support & News')}
        </LocalizedLink>
        <ChevronRight size={14} style={{ opacity: 0.5 }} />
        <span className="text-sm font-semibold">
          {t('help.breadcrumb_hotlines', 'Crisis Hotlines')}
        </span>
      </div>

      <PageHeader
        title={
          page?.title || t('help.title', ready ? 'Help & Crisis Hotlines' : 'Help & Crisis Hotlines')
        }
        subtitle={
          page?.subtitle ||
          t('help.subtitle', 'You are not alone. Find immediate support here.')
        }
      />

      {/* Sticky emergency banner — renders synchronously, never blocked on i18n/CMS */}
      <div className="sticky top-16 z-10 my-6">
        <Alert variant="destructive" className="rounded-container">
          <AlertTriangle className="h-6 w-6" />
          <AlertTitle className="font-bold">
            {t('help.emergency_title', 'In acute danger?')}
          </AlertTitle>
          <AlertDescription>
            {t(
              'help.emergency_body',
              'Call emergency services immediately: 112 (EU) or 911 (US/CA). Every second counts.',
            )}
          </AlertDescription>
        </Alert>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <HideScreen />
        <SelfHelpDrawer />
      </div>

      {/* Country-aware hero CTA */}
      {!loading && <HeroCTA hotlines={hotlines} country={countryFilter} />}

      {/* "What to expect" reassurance */}
      <WhatToExpect />

      {/* CMS intro text */}
      {sanitizedIntroHtml && (
        <div
          className="qg-help-intro mb-8"
          dangerouslySetInnerHTML={{ __html: sanitizedIntroHtml }}
        />
      )}

      {loading || !ready ? (
        <>
          <Skeleton className="mb-4 h-36 w-full rounded-element" />
          <Skeleton className="mb-4 h-36 w-full rounded-element" />
        </>
      ) : error || !page ? (
        <div className="py-8 text-center">
          <h2 className="mb-2 text-2xl font-bold">
            {t('help.error_title', 'Help page unavailable')}
          </h2>
          <p className="text-muted-foreground">
            {t(
              'help.error_body',
              'In acute danger, call your local emergency number: 112 (EU) or 911 (US/CA).',
            )}
          </p>
        </div>
      ) : (
        <>
          {/* Search + Filters */}
          <div className="mb-6 flex flex-col gap-4">
            <div className="relative">
              <Input
                placeholder={t('help.search_placeholder', 'Search hotlines...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t('help.search_placeholder', 'Search hotlines...')}
              />
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  opacity: 0.4,
                  pointerEvents: 'none',
                }}
              />
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
              <div className="min-w-[180px] flex-[1_1_180px]">
                <Label className="mb-1 block text-xs font-semibold">
                  {t('help.filter_country', 'Country')}
                </Label>
                <Select value={countryFilter} onValueChange={setCountryFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">
                      {t('help.filter_country_all', 'All countries')}
                    </SelectItem>
                    {availableCountries.map((c) => (
                      <SelectItem key={c} value={c}>
                        {countryLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[180px] flex-[1_1_180px]">
                <Label className="mb-1 block text-xs font-semibold">
                  {t('help.filter_topic', 'Topic')}
                </Label>
                <Select value={topicFilter} onValueChange={setTopicFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">
                      {t('help.filter_topic_all', 'All topics')}
                    </SelectItem>
                    {availableTopics.map((tp) => (
                      <SelectItem key={tp} value={tp}>
                        {t(`help.topic.${tp}`, tp)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {availableIntersections.length > 0 && (
                <div className="min-w-[180px] flex-[1_1_180px]">
                  <Label className="mb-1 block text-xs font-semibold">
                    {t('help.filter_intersection', 'Population')}
                  </Label>
                  <Select
                    value={intersectionFilter}
                    onValueChange={setIntersectionFilter}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">
                        {t('help.filter_intersection_all', 'All')}
                      </SelectItem>
                      {availableIntersections.map((ix) => (
                        <SelectItem key={ix} value={ix}>
                          {t(`help.intersection.${ix}`, ix)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Saved hotlines */}
          {bookmarkedHotlines.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Heart size={16} />
                {t('help.saved_hotlines', 'Your saved hotlines')}
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {bookmarkedHotlines.map((h) => (
                  <HotlineCard
                    key={`saved-${h.id}`}
                    hotline={h}
                    isBookmarked
                    toggleBookmark={toggleBookmark}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Main hotline grid */}
          {visibleHotlines.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t('help.no_results_title', 'No hotlines found')}
              description={t(
                'help.no_results',
                'No hotlines match these filters. Try "All countries" or check the international directories.',
              )}
              primaryAction={{
                label: t('help.reset_filters', 'Reset filters'),
                onClick: resetFilters,
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {visibleHotlines.map((h) => (
                <HotlineCard
                  key={h.id}
                  hotline={h}
                  isBookmarked={isBookmarked(h.id)}
                  toggleBookmark={toggleBookmark}
                />
              ))}
            </div>
          )}

          {/* Related resources */}
          <div className="mt-12 border-t pt-6">
            <h3 className="mb-3 text-sm font-bold">
              {t('help.related_resources', 'Related resources')}
            </h3>
            <div className="mb-4 flex flex-wrap gap-2">
              {[
                { label: t('help.topic.health', 'Health'), cat: 'Health & Wellness' },
                { label: t('help.topic.trans', 'Trans'), cat: 'Gender Identity' },
                { label: t('help.topic.lgbtq', 'LGBTQIA+'), cat: 'Identity & Expression' },
                { label: t('help.topic.violence', 'Violence'), cat: 'Safety & Practices' },
                { label: t('help.topic.legal', 'Legal'), cat: 'Legal Rights' },
                {
                  label: t('help.topic.relationships', 'Relationships'),
                  cat: 'Relationships & Connection',
                },
              ].map(({ label, cat }) => (
                <LocalizedLink
                  key={cat}
                  to={`/resources?category=${encodeURIComponent(cat)}`}
                  style={{ textDecoration: 'none' }}
                >
                  <Badge variant="secondary" className="cursor-pointer">
                    {label}
                  </Badge>
                </LocalizedLink>
              ))}
            </div>
            <Button asChild variant="ghost" size="sm">
              <LocalizedLink to="/resources">
                {t('help.browse_resources', 'Browse all resources')}
                <ChevronRight size={16} className="ml-1" />
              </LocalizedLink>
            </Button>
          </div>

          <p className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
            {t('help.disclaimer', 'Queer Guide does not replace professional help.')}
          </p>
        </>
      )}
    </div>
  );
}

function HotlineCard({
  hotline,
  isBookmarked,
  toggleBookmark,
}: {
  hotline: Hotline;
  isBookmarked: boolean;
  toggleBookmark: (id: string) => void;
}) {
  const { t } = useTranslation();
  const phoneFromLegacy: HotlineChannel | null = hotline.phone
    ? { kind: 'phone', value: hotline.phone }
    : null;
  const channels: HotlineChannel[] =
    hotline.channels && hotline.channels.length > 0
      ? hotline.channels
      : phoneFromLegacy
        ? [phoneFromLegacy]
        : [];
  const primaryPhone = channels.find((c) => c.kind === 'phone');
  const secondaryChannels = channels.filter((c) => c.kind !== 'phone');
  const h247 = is247(hotline.hours);
  const verified = hotline.verified_at ? new Date(hotline.verified_at) : null;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-snug">{hotline.name}</CardTitle>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => toggleBookmark(hotline.id)}
              aria-label={
                isBookmarked
                  ? t('help.unsave', 'Remove from saved')
                  : t('help.save', 'Save hotline')
              }
              className="rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Heart
                size={16}
                fill={isBookmarked ? 'currentColor' : 'none'}
                style={{ opacity: isBookmarked ? 1 : 0.4 }}
              />
            </button>
            <Badge variant="outline" className="shrink-0">
              {countryLabel(hotline.country)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{hotline.description}</p>

        {hotline.what_to_expect && (
          <details className="rounded-element border bg-muted/30 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">
              {t('help.expect_short', 'What to expect')}
            </summary>
            <p className="mt-2 text-muted-foreground">{hotline.what_to_expect}</p>
          </details>
        )}

        <div className="flex flex-wrap gap-1">
          {hotline.topics.map((tp) => {
            const resourceCat = TOPIC_TO_RESOURCE[tp];
            if (resourceCat) {
              return (
                <LocalizedLink
                  key={tp}
                  to={`/resources?category=${encodeURIComponent(resourceCat)}`}
                  style={{ textDecoration: 'none' }}
                >
                  <Badge variant="secondary" className="cursor-pointer text-xs">
                    {t(`help.topic.${tp}`, tp)}
                  </Badge>
                </LocalizedLink>
              );
            }
            return (
              <Badge key={tp} variant="secondary" className="text-xs">
                {t(`help.topic.${tp}`, tp)}
              </Badge>
            );
          })}
          {(hotline.intersections ?? []).map((ix) => (
            <Badge key={ix} variant="outline" className="text-xs">
              {t(`help.intersection.${ix}`, ix)}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {h247 && (
            <Badge
              variant="default"
              className="text-xs"
              style={{
                backgroundColor: 'hsl(var(--foreground))',
                color: 'hsl(var(--background))',
              }}
            >
              <Zap size={10} className="mr-0.5" />
              {t('help.badge_24_7', '24/7')}
            </Badge>
          )}
          {hotline.free && (
            <Badge variant="outline" className="text-xs">
              <Shield size={10} className="mr-0.5" />
              {t('help.badge_free', 'Free')}
            </Badge>
          )}
          {hotline.anonymous && (
            <Badge variant="outline" className="text-xs">
              <EyeOff size={10} className="mr-0.5" />
              {t('help.badge_anonymous', 'Anonymous')}
            </Badge>
          )}
          {hotline.reports_to_police && (
            <Badge variant="destructive" className="text-xs">
              <ShieldAlert size={10} className="mr-0.5" />
              {t('help.badge_reports_police', 'May report to police')}
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock size={14} aria-hidden />
            <span>{hotline.hours}</span>
          </div>
          {hotline.languages.length > 0 && (
            <div className="flex items-center gap-2">
              <Languages size={14} aria-hidden />
              <span>{hotline.languages.map((l) => l.toUpperCase()).join(' · ')}</span>
            </div>
          )}
          {hotline.operator && (
            <div className="text-xs">
              {t('help.operator', 'Operated by')}: {hotline.operator}
              {hotline.affiliation && hotline.affiliation !== 'secular' && (
                <span className="ml-1 opacity-80">
                  ({t(`help.affiliation.${hotline.affiliation}`, hotline.affiliation)})
                </span>
              )}
            </div>
          )}
          {verified && (
            <div className="flex items-center gap-1 text-xs">
              <BadgeCheck size={12} aria-hidden />
              {t('help.verified_on', 'Verified')}: {verified.toISOString().slice(0, 10)}
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {primaryPhone && (
            <Button
              asChild
              className="flex-1 min-w-[160px]"
              size="lg"
              aria-label={t('help.call_aria', 'Call {{name}} {{phone}}', {
                name: hotline.name,
                phone: primaryPhone.value,
              })}
            >
              <a href={channelHref(primaryPhone)}>
                <Phone size={18} className="mr-2" />
                {primaryPhone.value}
              </a>
            </Button>
          )}
          {secondaryChannels.map((c) => {
            const Icon = CHANNEL_ICON[c.kind];
            return (
              <Button
                key={`${c.kind}-${c.value}`}
                asChild
                variant="outline"
                size="lg"
                aria-label={`${hotline.name} — ${c.kind}`}
              >
                <a
                  href={channelHref(c)}
                  target={c.kind === 'chat' ? '_blank' : undefined}
                  rel={c.kind === 'chat' ? 'noopener noreferrer' : undefined}
                >
                  <Icon size={18} />
                </a>
              </Button>
            );
          })}
          {hotline.url && (
            <Button
              asChild
              variant="outline"
              size="lg"
              aria-label={`${hotline.name} — Website`}
            >
              <a href={hotline.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={18} />
              </a>
            </Button>
          )}
        </div>

        <div className="flex items-center justify-end">
          <ReportHotline hotlineId={hotline.id} />
        </div>
      </CardContent>
    </Card>
  );
}
