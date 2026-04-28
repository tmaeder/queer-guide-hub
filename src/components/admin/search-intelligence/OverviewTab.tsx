import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
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

  if (loading) return <Typography>Loading…</Typography>;
  if (error) {
    return (
      <Box>
        <Typography color="error">Could not load: {error}</Typography>
        <Typography variant="caption" color="text.secondary">
          The search-intelligence edge function may not be deployed yet, or your role lacks
          admin access.
        </Typography>
      </Box>
    );
  }
  if (!data) return null;

  const meiliByName = new Map(data.meili.map((m) => [m.uid, m]));

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6" gutterBottom>
          Indexes overview
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Compares the {data.managed.length} indexes the platform manages against what is currently
          present in Meilisearch and the row counts in Postgres.
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 2,
        }}
      >
        {data.managed.map((name) => {
          const dbCount = data.db_counts[name];
          const inMeili = meiliByName.has(name);
          return (
            <Card key={name}>
              <CardHeader>
                <CardTitle>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <span>{name}</span>
                    {!inMeili && <Badge variant="destructive">missing in Meili</Badge>}
                  </Stack>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Stack spacing={0.5}>
                  <Typography variant="caption" color="text.secondary">
                    Postgres rows
                  </Typography>
                  <Typography variant="h6">
                    {dbCount == null ? '—' : dbCount.toLocaleString()}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Stack>
  );
}
