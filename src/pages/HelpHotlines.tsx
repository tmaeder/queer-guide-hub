/**
 * HelpHotlines — Crisis support & help hotlines page at /help.
 *
 * Renders a curated, filterable list of LGBTQIA+ crisis hotlines and
 * general crisis counselling lines. Data is stored in the cms_pages
 * row with slug='help':
 *   - body_html  → DOMPurify-sanitized intro text
 *   - body_json  → { hotlines: Hotline[] }
 *
 * Admins edit both fields via AdminCMS without touching code.
 * Note: body_html is sanitized with DOMPurify before rendering (same
 * pattern as CMSRoutePage.tsx) — content is trusted CMS content only.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
} from 'lucide-react';
import DOMPurify from 'dompurify';

import { useMeta } from '@/hooks/useMeta';
import { useCMSPage } from '@/hooks/useCMSPage';
import { useAuth } from '@/hooks/useAuth';
import { useHotlineBookmarks } from '@/hooks/useHotlineBookmarks';
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
import type { CMSPage } from '@/types/cms';

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

function countryLabel(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

function detectBrowserCountry(): string {
  if (typeof navigator === 'undefined') return 'ALL';
  const locale = navigator.language || 'en-US';
  const region = locale.split('-')[1]?.toUpperCase();
  if (region && COUNTRY_NAMES[region]) return region;
  return 'ALL';
}

function matchProfileLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const lower = location.toLowerCase();
  for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
    if (lower.includes(name.toLowerCase()) || lower.includes(code.toLowerCase())) return code;
  }
  return null;
}

function getInitialCountry(profileLocation?: string | null): string {
  const stored = localStorage.getItem('qg_help_country');
  if (stored) return stored;
  const fromProfile = matchProfileLocation(profileLocation);
  if (fromProfile) return fromProfile;
  return detectBrowserCountry();
}

function getInitialTopic(): string {
  return localStorage.getItem('qg_help_topic') || 'ALL';
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

export default function HelpHotlines() {
  // `ready` is authoritative when react-i18next is configured with
  // `useSuspense: false` (see src/i18n/index.ts). Gate first paint on it so
  // we never render fallback defaults during the brief init window — that
  // was the source of the EN/DE bleed reported on /help.
  const { t, ready } = useTranslation();
  const { user } = useAuth();
  const { bookmarkedIds, isBookmarked, toggle: toggleBookmark } = useHotlineBookmarks();

  const [page, setPage] = useState<CMSPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [countryFilter, setCountryFilter] = useState<string>('ALL');
  const [topicFilter, setTopicFilter] = useState<string>(() => getInitialTopic());
  const [searchQuery, setSearchQuery] = useState('');

  const [countryInitialized, setCountryInitialized] = useState(false);

  useMeta({
    title: t('help.title', 'Help & Crisis Hotlines'),
    description: t(
      'help.meta_description',
      'Free, anonymous LGBTQIA+ crisis hotlines and counselling services worldwide. You are not alone.',
    ),
    canonicalPath: '/help',
  });

  // Initialize country filter with profile awareness
  useEffect(() => {
    if (countryInitialized) return;
    const country = getInitialCountry(user?.user_metadata?.location as string | undefined);
    setCountryFilter(country);
    setCountryInitialized(true);
  }, [user, countryInitialized]);

  // Persist filters
  useEffect(() => {
    if (!countryInitialized) return;
    localStorage.setItem('qg_help_country', countryFilter);
  }, [countryFilter, countryInitialized]);

  useEffect(() => {
    localStorage.setItem('qg_help_topic', topicFilter);
  }, [topicFilter]);

  // Migrated to useCMSPage hook (DUP-4).
  // DUP-4 — pull cms_pages 'help' fetch into useCMSPage hook.
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

  const visibleHotlines = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return hotlines.filter((h) => {
      if (countryFilter !== 'ALL' && h.country !== countryFilter) return false;
      if (topicFilter !== 'ALL' && !h.topics.includes(topicFilter)) return false;
      if (q) {
        const haystack = `${h.name} ${h.description} ${h.languages.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [hotlines, countryFilter, topicFilter, searchQuery]);

  const bookmarkedHotlines = useMemo(() => {
    if (bookmarkedIds.size === 0) return [];
    return hotlines.filter((h) => bookmarkedIds.has(h.id));
  }, [hotlines, bookmarkedIds]);

  // Quick-action: top 3 hotlines for selected country
  const quickActionHotlines = useMemo(() => {
    if (countryFilter === 'ALL') return [];
    return [...visibleHotlines]
      .sort((a, b) => {
        const a247 = is247(a.hours) ? 1 : 0;
        const b247 = is247(b.hours) ? 1 : 0;
        if (b247 !== a247) return b247 - a247;
        const aFree = a.free ? 1 : 0;
        const bFree = b.free ? 1 : 0;
        if (bFree !== aFree) return bFree - aFree;
        return b.topics.length - a.topics.length;
      })
      .slice(0, 3);
  }, [visibleHotlines, countryFilter]);

  // Body HTML: trusted CMS content, sanitized with DOMPurify (same as CMSRoutePage.tsx).
  const sanitizedIntroHtml = useMemo(
    () => (page?.body_html ? DOMPurify.sanitize(page.body_html) : ''),
    [page],
  );

  const resetFilters = () => {
    setCountryFilter('ALL');
    setTopicFilter('ALL');
    setSearchQuery('');
  };

  if (loading || !ready) {
    return (
      <div className="mx-auto w-full max-w-screen-lg px-4 py-8 sm:px-6">
        <Skeleton className="mb-2 h-14 w-2/5" />
        <Skeleton className="mb-6 h-6 w-3/5" />
        <Skeleton className="mb-6 h-20 w-full rounded-md" />
        <Skeleton className="mb-4 h-36 w-full rounded-md" />
        <Skeleton className="mb-4 h-36 w-full rounded-md" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="mx-auto w-full max-w-screen-lg px-4 py-16 text-center sm:px-6">
        <h1 className="mb-2 text-3xl font-bold">
          {t('help.error_title', 'Help page unavailable')}
        </h1>
        <p className="mb-6 text-muted-foreground">
          {t(
            'help.error_body',
            'In acute danger, call your local emergency number: 112 (EU) or 911 (US/CA).',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-screen-lg px-4 py-8 sm:px-6">
      <style dangerouslySetInnerHTML={{ __html: INTRO_HTML_CSS }} />
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
        title={page.title || t('help.title', 'Help & Crisis Hotlines')}
        subtitle={
          page.subtitle ||
          t('help.subtitle', 'You are not alone. Find immediate support here.')
        }
      />

      {/* Sticky emergency banner */}
      <div className="sticky top-16 z-10 my-6">
        <Alert variant="destructive" className="rounded-lg">
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

      {/* Quick-action crisis bar */}
      {quickActionHotlines.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          <span
            className="text-xs font-semibold uppercase"
            style={{ letterSpacing: 1 }}
          >
            {t('help.quick_call', 'Quick call')}
          </span>
          {quickActionHotlines.map((h) => {
            if (!h.phone) return null;
            const telHref = `tel:${h.phone.replace(/\s+/g, '')}`;
            return (
              <Button
                key={h.id}
                asChild
                size="lg"
                className="w-full justify-between text-base"
              >
                <a href={telHref}>
                  <span className="flex items-center gap-2">
                    <Phone size={18} />
                    <span>{h.name}</span>
                  </span>
                  <span>{h.phone}</span>
                </a>
              </Button>
            );
          })}
        </div>
      )}

      {/* CMS intro text */}
      {sanitizedIntroHtml && (
        <div
          className="qg-help-intro mb-8"
          dangerouslySetInnerHTML={{ __html: sanitizedIntroHtml }}
        />
      )}

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
          <div className="min-w-[220px] flex-[1_1_220px]">
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

          <div className="min-w-[220px] flex-[1_1_220px]">
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
  const telHref = hotline.phone ? `tel:${hotline.phone.replace(/\s+/g, '')}` : null;
  const h247 = is247(hotline.hours);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-snug">{hotline.name}</CardTitle>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              onClick={() => toggleBookmark(hotline.id)}
              aria-label={
                isBookmarked
                  ? t('help.unsave', 'Remove from saved')
                  : t('help.save', 'Save hotline')
              }
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
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
        </div>

        <div className="flex flex-wrap gap-1">
          {h247 && (
            <Badge
              variant="default"
              className="text-xs"
              style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
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
        </div>

        <div className="mt-auto flex gap-2 pt-2">
          {telHref && (
            <Button
              asChild
              className="flex-1"
              size="lg"
              aria-label={t('help.call_aria', 'Anrufen: {{name}} {{phone}}', {
                name: hotline.name,
                phone: hotline.phone,
              })}
            >
              <a href={telHref}>
                <Phone size={18} className="mr-2" />
                {hotline.phone}
              </a>
            </Button>
          )}
          {hotline.url && (
            <Button asChild variant="outline" size="lg" aria-label={`${hotline.name} — Website`}>
              <a href={hotline.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={18} />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
