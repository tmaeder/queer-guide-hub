import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Globe, MapPin, Calendar, Play, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
    types: 'Events, Guides, Stays',
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
        headers: {
          'Content-Type': 'application/json',
          'X-Scraper-Secret': import.meta.env.VITE_SCRAPER_SECRET ?? '',
        },
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

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const ingestRes = await fetch(
        `https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/ingest-scraper-results`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ entities: allEntities }),
        },
      );
      const ingestData = await ingestRes.json();

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
      <CardHeader>
        <CardTitle>
          <Globe style={{ height: 18, width: 18 }} />
          Web Scrapers
          {online === true && (
            <Badge variant="outline">
              Online
            </Badge>
          )}
          {online === false && (
            <Badge variant="destructive">
              Offline
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {online === false && (
          <Alert variant="destructive">
            <AlertTriangle style={{ height: 14, width: 14 }} />
            <AlertDescription>
              Scraper service unreachable. Check Worker deployment.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {NODE_SCRAPERS.map((s) => (
            <div key={s.key} className="flex items-center gap-3 p-3 border border-border rounded-badge">
              <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-[0.85rem] font-semibold">{s.label}</p>
                <p className="text-[0.7rem] text-muted-foreground truncate">
                  {s.types} &middot; {s.url}
                </p>
                {results[s.key] && (
                  <p className="text-[0.65rem] text-green-600">
                    {results[s.key].count} scraped, {results[s.key].inserted} saved
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant={running[s.key] ? 'secondary' : 'default'}
                disabled={online !== true || running[s.key]}
                onClick={() => trigger(s.key)}
              >
                {running[s.key] ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                    Running
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 mr-1" /> Run
                  </>
                )}
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-center p-3 border border-dashed border-border rounded-badge">
            <Button
              size="sm"
              variant="outline"
              disabled={online !== true || Object.values(running).some(Boolean)}
              onClick={() => triggerAll()}
            >
              <Play className="h-3 w-3 mr-1" />
              Run All Scrapers
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
