import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Globe, MapPin, Calendar, Play, RefreshCw, AlertTriangle } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { api } from '@/integrations/api/client';

const SCRAPER_API = import.meta.env.DEV
  ? 'http://localhost:4400'
  : 'https://queer-guide-scraper-api.maeder-tobiassimon.workers.dev';

const NODE_SCRAPERS = [
  { key: 'patroc', label: 'Patroc', url: 'patroc.com', types: 'Venues, Events', icon: MapPin },
  {
    key: 'outsavvy',
    label: 'Outsavvy',
    url: 'outsavvy.com/guide',
    types: 'Venues, Events',
    icon: Calendar,
  },
  {
    key: 'travelgay',
    label: 'Travel Gay',
    url: 'travelgay.com',
    types: 'Venues, Events',
    icon: MapPin,
  },
  {
    key: 'iglta',
    label: 'IGLTA Pride Calendar',
    url: 'iglta.org/events/pride-calendar',
    types: 'Events',
    icon: Calendar,
  },
  {
    key: 'misterbandb',
    label: 'MisterBnB',
    url: 'sitemap.misterbandb.com',
    types: 'Events, Guides',
    icon: MapPin,
  },
  {
    key: 'wikipedia',
    label: 'Wikipedia Gay Villages',
    url: 'en.wikipedia.org/wiki/List_of_gay_villages',
    types: 'Places',
    icon: Globe,
  },
] as const;

export const WebScrapersPanel = () => {
  const { toast } = useToast();
  const [online, setOnline] = useState<boolean | null>(null);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { count: number; inserted: number }>>({});

  useEffect(() => {
    fetch(`${SCRAPER_API}/health`)
      .then((r) => r.json())
      .then((d) => setOnline(d.ok === true))
      .catch(() => setOnline(false));
  }, []);

  const trigger = async (source: string) => {
    setRunning((prev) => ({ ...prev, [source]: true }));
    try {
      const res = await fetch(`${SCRAPER_API}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const allEntities = (data.sources ?? []).flatMap(
        (s: { entities?: unknown[] }) => s.entities ?? [],
      );
      const totalScraped = data.totalEntities ?? allEntities.length;

      if (totalScraped === 0) {
        toast({
          title: `${source} scraper finished`,
          description: 'No entities found on source page',
        });
        setResults((prev) => ({ ...prev, [source]: { count: 0, inserted: 0 } }));
        return;
      }

      const { data: ingestData, error: ingestError } = await api.functions.invoke(
        'ingestion-pipeline',
        {
          body: { entities: allEntities },
        },
      );
      if (ingestError) throw new Error(ingestError.message || 'Ingestion failed');

      setResults((prev) => ({
        ...prev,
        [source]: { count: totalScraped, inserted: ingestData.inserted ?? 0 },
      }));

      toast({
        title: `${source} scraper completed`,
        description: `Scraped ${totalScraped} entities, ${ingestData.inserted ?? 0} saved to DB`,
      });
    } catch (err) {
      toast({
        title: `${source} failed`,
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRunning((prev) => ({ ...prev, [source]: false }));
    }
  };

  const triggerAll = async () => {
    const active = NODE_SCRAPERS;
    for (const s of active) {
      await trigger(s.key);
    }
  };

  return (
    <Card>
      <CardHeader sx={{ pb: 1 }}>
        <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem' }}>
          <Globe style={{ height: 18, width: 18 }} />
          Web Scrapers
          {online === true && (
            <Badge variant="outline" sx={{ ml: 1, fontSize: '0.7rem', color: 'success.main' }}>
              Online
            </Badge>
          )}
          {online === false && (
            <Badge variant="destructive" sx={{ ml: 1, fontSize: '0.7rem' }}>
              Offline
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {online === false && (
          <Alert variant="destructive" sx={{ py: 1 }}>
            <AlertTriangle style={{ height: 14, width: 14 }} />
            <AlertDescription sx={{ fontSize: '0.8rem' }}>
              Scraper service unreachable. Check Worker deployment.
            </AlertDescription>
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
          {NODE_SCRAPERS.map((s) => (
            <Box
              key={s.key}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              <s.icon
                style={{ height: 16, width: 16, flexShrink: 0, color: 'var(--muted-foreground)' }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{s.label}</Typography>
                <Typography
                  sx={{
                    fontSize: '0.7rem',
                    color: 'text.secondary',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.types} &middot; {s.url}
                </Typography>
                {results[s.key] && (
                  <Typography sx={{ fontSize: '0.65rem', color: 'success.main' }}>
                    {results[s.key].count} scraped, {results[s.key].inserted} saved
                  </Typography>
                )}
              </Box>
              <Button
                size="sm"
                variant={running[s.key] ? 'secondary' : 'default'}
                sx={{ height: 28, px: 1.5, fontSize: '0.75rem', flexShrink: 0 }}
                disabled={online !== true || running[s.key]}
                onClick={() => trigger(s.key)}
              >
                {running[s.key] ? (
                  <>
                    <RefreshCw
                      style={{
                        height: 12,
                        width: 12,
                        animation: 'spin 1s linear infinite',
                        marginRight: 4,
                      }}
                    />{' '}
                    Running
                  </>
                ) : (
                  <>
                    <Play style={{ height: 12, width: 12, marginRight: 4 }} /> Run
                  </>
                )}
              </Button>
            </Box>
          ))}
          {/* Run all */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 1.5,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              borderStyle: 'dashed',
            }}
          >
            <Button
              size="sm"
              variant="outline"
              sx={{ fontSize: '0.75rem' }}
              disabled={online !== true || Object.values(running).some(Boolean)}
              onClick={() => triggerAll()}
            >
              <Play style={{ height: 12, width: 12, marginRight: 4 }} />
              Run All Scrapers
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
