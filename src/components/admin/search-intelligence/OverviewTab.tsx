import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { callSearchIntelligence, IndexesResponse } from '@/hooks/useSearchIntelligence';

export function OverviewTab() {
  const [data, setData] = useState<IndexesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await callSearchIntelligence<IndexesResponse>('indexes');
      if (cancelled) return;
      if (!res.success) setError(res.error);
      else setData(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p>Loading…</p>;
  if (error) {
    return (
      <div>
        <p className="text-destructive">Could not load: {error}</p>
        <p className="text-xs text-muted-foreground">
          The search-intelligence edge function may not be deployed yet, or your role lacks
          admin access.
        </p>
      </div>
    );
  }
  if (!data) return null;

  const meiliByName = new Map(data.meili.map((m) => [m.uid, m]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h6 className="text-base font-semibold mb-2">Indexes overview</h6>
        <p className="text-sm text-muted-foreground">
          Compares the {data.managed.length} indexes the platform manages against what is currently
          present in Meilisearch and the row counts in Postgres.
        </p>
      </div>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
      >
        {data.managed.map((name) => {
          const dbCount = data.db_counts[name];
          const inMeili = meiliByName.has(name);
          return (
            <Card key={name}>
              <CardHeader>
                <CardTitle>
                  <div className="flex flex-row items-center gap-2">
                    <span>{name}</span>
                    {!inMeili && <Badge variant="destructive">missing in Meili</Badge>}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Postgres rows</span>
                  <p className="text-base font-semibold">
                    {dbCount == null ? '—' : dbCount.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
