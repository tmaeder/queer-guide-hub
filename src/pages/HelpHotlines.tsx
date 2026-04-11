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
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import { Phone, ExternalLink, Clock, Languages, AlertTriangle } from 'lucide-react';
import DOMPurify from 'dompurify';

import { supabase } from '@/integrations/supabase/client';
import { useMeta } from '@/hooks/useMeta';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

export default function HelpHotlines() {
  const { t } = useTranslation();
  const [page, setPage] = useState<CMSPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [countryFilter, setCountryFilter] = useState<string>(() => detectBrowserCountry());
  const [topicFilter, setTopicFilter] = useState<string>('ALL');

  useMeta({
    title: t('help.title', 'Hilfe & Krisen-Hotlines'),
    description: t(
      'help.meta_description',
      'Kostenlose, anonyme LGBTQIA+ Krisenhotlines und Beratungsstellen weltweit. Du bist nicht allein.',
    ),
    canonicalPath: '/help',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      const { data, error: fetchError } = await supabase
        .from('cms_pages' as never)
        .select('*')
        .eq('slug', 'help')
        .eq('workflow_state', 'published')
        .single();
      if (cancelled) return;
      if (fetchError || !data) {
        setError(true);
      } else {
        setPage(data as CMSPage);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    return hotlines.filter((h) => {
      if (countryFilter !== 'ALL' && h.country !== countryFilter) return false;
      if (topicFilter !== 'ALL' && !h.topics.includes(topicFilter)) return false;
      return true;
    });
  }, [hotlines, countryFilter, topicFilter]);

  // Body HTML is trusted CMS content, sanitized with DOMPurify before
  // rendering (same hardening as src/pages/CMSRoutePage.tsx line 201).
  const sanitizedIntroHtml = useMemo(
    () => (page?.body_html ? DOMPurify.sanitize(page.body_html) : ''),
    [page],
  );

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
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
      <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <PageHeader
        title={page.title || t('help.title', 'Hilfe & Krisen-Hotlines')}
        subtitle={
          page.subtitle ||
          t('help.subtitle', 'Du bist nicht allein. Hier findest du sofortige Unterstützung.')
        }
      />

      <Alert
        severity="error"
        icon={<AlertTriangle size={24} />}
        sx={{
          mt: 3,
          mb: 3,
          borderRadius: 2,
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

      {sanitizedIntroHtml && (
        <Box
          // Sanitized above via DOMPurify.sanitize — safe to inject.
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

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          mb: 3,
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

      {visibleHotlines.length === 0 ? (
        <Typography variant="body1" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {t(
            'help.no_results',
            'Keine Hotlines mit diesen Filtern gefunden. Versuche "Alle Länder" oder prüfe die internationalen Verzeichnisse.',
          )}
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          {visibleHotlines.map((h) => (
            <HotlineCard key={h.id} hotline={h} />
          ))}
        </Box>
      )}

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

function HotlineCard({ hotline }: { hotline: Hotline }) {
  const { t } = useTranslation();
  const telHref = hotline.phone ? `tel:${hotline.phone.replace(/\s+/g, '')}` : null;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <CardTitle className="text-lg leading-snug">{hotline.name}</CardTitle>
          <Badge variant="outline" className="shrink-0">
            {countryLabel(hotline.country)}
          </Badge>
        </Box>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          {hotline.description}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {hotline.topics.map((tp) => (
            <Badge key={tp} variant="secondary" className="text-xs">
              {t(`help.topic.${tp}`, tp)}
            </Badge>
          ))}
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
