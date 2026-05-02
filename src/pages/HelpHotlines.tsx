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
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
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

export default function HelpHotlines() {
  const { t } = useTranslation();
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
    title: t('help.title', 'Hilfe & Krisen-Hotlines'),
    description: t(
      'help.meta_description',
      'Kostenlose, anonyme LGBTQIA+ Krisenhotlines und Beratungsstellen weltweit. Du bist nicht allein.',
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

  if (loading) {
    return (
      <Container sx={{ py: 4 }}>
        <Skeleton variant="text" width="40%" height={56} />
        <Skeleton variant="text" width="60%" height={24} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={80} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={140} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={140} sx={{ mb: 2 }} />
      </Container>
    );
  }

  if (error || !page) {
    return (
      <Container sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          {t('help.error_title', 'Hilfe-Seite nicht verfügbar')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {t(
            'help.error_body',
            'Bei akuter Gefahr wähle den Notruf: 112 (EU) oder 911 (US/CA).',
          )}
        </Typography>
      </Container>
    );
  }

  return (
    <Container sx={{ py: 4 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
        <Typography
          component={LocalizedLink}
          to="/resources"
          variant="body2"
          sx={{ color: 'text.secondary', textDecoration: 'none', '&:hover': { opacity: 0.7 } }}
        >
          {t('help.breadcrumb_resources', 'Resources')}
        </Typography>
        <ChevronRight size={14} style={{ opacity: 0.5 }} />
        <Typography
          component={LocalizedLink}
          to="/resources?category=Support+%26+News"
          variant="body2"
          sx={{ color: 'text.secondary', textDecoration: 'none', '&:hover': { opacity: 0.7 } }}
        >
          {t('help.breadcrumb_support', 'Support & News')}
        </Typography>
        <ChevronRight size={14} style={{ opacity: 0.5 }} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t('help.breadcrumb_hotlines', 'Crisis Hotlines')}
        </Typography>
      </Box>

      <PageHeader
        title={page.title || t('help.title', 'Hilfe & Krisen-Hotlines')}
        subtitle={
          page.subtitle ||
          t('help.subtitle', 'Du bist nicht allein. Hier findest du sofortige Unterstützung.')
        }
      />

      {/* Sticky emergency banner */}
      <Alert
        severity="error"
        icon={<AlertTriangle size={24} />}
        sx={{
          mt: 3,
          mb: 3,
          borderRadius: 2,
          position: 'sticky',
          top: 64,
          zIndex: 10,
          '& .MuiAlert-message': { fontSize: '1rem', fontWeight: 500 },
        }}
      >
        <AlertTitle sx={{ fontWeight: 700 }}>
          {t('help.emergency_title', 'Akute Gefahr?')}
        </AlertTitle>
        {t(
          'help.emergency_body',
          'Wähle sofort den Notruf: 112 (EU) oder 911 (US/CA). Bei unmittelbarer Lebensgefahr zählt jede Sekunde.',
        )}
      </Alert>

      {/* Quick-action crisis bar */}
      {quickActionHotlines.length > 0 && (
        <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            {t('help.quick_call', 'Quick call')}
          </Typography>
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Phone size={18} />
                    <span>{h.name}</span>
                  </Box>
                  <span>{h.phone}</span>
                </a>
              </Button>
            );
          })}
        </Box>
      )}

      {/* CMS intro text — sanitized with DOMPurify (trusted admin content) */}
      {sanitizedIntroHtml && (
        <Box
          dangerouslySetInnerHTML={{ __html: sanitizedIntroHtml }}
          sx={{
            mb: 4,
            '& p': { fontSize: '1rem', lineHeight: 1.7, mb: 1.5 },
            '& strong': { fontWeight: 700 },
            '& a': { color: 'primary.main', textDecoration: 'underline' },
            '& hr': { borderColor: 'divider', my: 2 },
            '& em': { color: 'text.secondary' },
          }}
        />
      )}

      {/* Search + Filters */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        <Box sx={{ position: 'relative' }}>
          <Input
            placeholder={t('help.search_placeholder', 'Search hotlines...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('help.search_placeholder', 'Search hotlines...')}
          />
          <Search
            size={16}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }}
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ minWidth: 220, flex: '1 1 220px' }}>
            <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>
              {t('help.filter_country', 'Land')}
            </Typography>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('help.filter_country_all', 'Alle Länder')}</SelectItem>
                {availableCountries.map((c) => (
                  <SelectItem key={c} value={c}>
                    {countryLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          <Box sx={{ minWidth: 220, flex: '1 1 220px' }}>
            <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>
              {t('help.filter_topic', 'Thema')}
            </Typography>
            <Select value={topicFilter} onValueChange={setTopicFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('help.filter_topic_all', 'Alle Themen')}</SelectItem>
                {availableTopics.map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {t(`help.topic.${tp}`, tp)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
        </Box>
      </Box>

      {/* Saved hotlines */}
      {bookmarkedHotlines.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Heart size={16} />
            {t('help.saved_hotlines', 'Your saved hotlines')}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
              gap: 2,
            }}
          >
            {bookmarkedHotlines.map((h) => (
              <HotlineCard key={`saved-${h.id}`} hotline={h} isBookmarked toggleBookmark={toggleBookmark} />
            ))}
          </Box>
        </Box>
      )}

      {/* Main hotline grid */}
      {visibleHotlines.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t('help.no_results_title', 'No hotlines found')}
          description={t(
            'help.no_results',
            'Keine Hotlines mit diesen Filtern gefunden. Versuche "Alle Länder" oder prüfe die internationalen Verzeichnisse.',
          )}
          primaryAction={{
            label: t('help.reset_filters', 'Reset filters'),
            onClick: resetFilters,
          }}
        />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          {visibleHotlines.map((h) => (
            <HotlineCard
              key={h.id}
              hotline={h}
              isBookmarked={isBookmarked(h.id)}
              toggleBookmark={toggleBookmark}
            />
          ))}
        </Box>
      )}

      {/* Related resources */}
      <Box sx={{ mt: 5, pt: 3, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          {t('help.related_resources', 'Related resources')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {[
            { label: t('help.topic.health', 'Health'), cat: 'Health & Wellness' },
            { label: t('help.topic.trans', 'Trans'), cat: 'Gender Identity' },
            { label: t('help.topic.lgbtq', 'LGBTQIA+'), cat: 'Identity & Expression' },
            { label: t('help.topic.violence', 'Violence'), cat: 'Safety & Practices' },
            { label: t('help.topic.legal', 'Legal'), cat: 'Legal Rights' },
            { label: t('help.topic.relationships', 'Relationships'), cat: 'Relationships & Connection' },
          ].map(({ label, cat }) => (
            <LocalizedLink key={cat} to={`/resources?category=${encodeURIComponent(cat)}`} style={{ textDecoration: 'none' }}>
              <Badge variant="secondary" className="cursor-pointer">
                {label}
              </Badge>
            </LocalizedLink>
          ))}
        </Box>
        <Button asChild variant="ghost" size="sm">
          <LocalizedLink to="/resources">
            {t('help.browse_resources', 'Browse all resources')}
            <ChevronRight size={16} className="ml-1" />
          </LocalizedLink>
        </Button>
      </Box>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}
      >
        {t('help.disclaimer', 'Queer Guide ersetzt keine professionelle Hilfe.')}
      </Typography>
    </Container>
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
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <CardTitle className="text-lg leading-snug">{hotline.name}</CardTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <button
              onClick={() => toggleBookmark(hotline.id)}
              aria-label={isBookmarked ? t('help.unsave', 'Remove from saved') : t('help.save', 'Save hotline')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <Heart size={16} fill={isBookmarked ? 'currentColor' : 'none'} style={{ opacity: isBookmarked ? 1 : 0.4 }} />
            </button>
            <Badge variant="outline" className="shrink-0">
              {countryLabel(hotline.country)}
            </Badge>
          </Box>
        </Box>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          {hotline.description}
        </Typography>

        {/* Topic badges — clickable, link to resources */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {hotline.topics.map((tp) => {
            const resourceCat = TOPIC_TO_RESOURCE[tp];
            if (resourceCat) {
              return (
                <LocalizedLink key={tp} to={`/resources?category=${encodeURIComponent(resourceCat)}`} style={{ textDecoration: 'none' }}>
                  <Badge variant="secondary" className="text-xs cursor-pointer">
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
        </Box>

        {/* Feature badges */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {h247 && (
            <Badge variant="default" className="text-xs" style={{ backgroundColor: 'var(--brand, #b60d3d)', color: '#fff' }}>
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
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Clock size={14} aria-hidden />
            <span>{hotline.hours}</span>
          </Box>
          {hotline.languages.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Languages size={14} aria-hidden />
              <span>{hotline.languages.map((l) => l.toUpperCase()).join(' · ')}</span>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mt: 'auto', pt: 1 }}>
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
        </Box>
      </CardContent>
    </Card>
  );
}
