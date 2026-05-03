import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { callSearchIntelligence, AuditEntry } from '@/hooks/useSearchIntelligence';

export function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await callSearchIntelligence<AuditEntry[]>('audit', {
        searchParams: {
          action: actionFilter || undefined,
          resource: resourceFilter || undefined,
          limit: '200',
        },
      });
      if (cancelled) return;
      if (!res.success) setError(res.error);
      else {
        setEntries(res.data);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [actionFilter, resourceFilter]);

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField
          label="Action contains"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          size="small"
          sx={{ minWidth: 200 }}
        />
        <TextField
          label="Resource type"
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          size="small"
          sx={{ minWidth: 200 }}
        />
      </Stack>
      {error && <Typography color="error">{error}</Typography>}
      {loading ? (
        <Typography>Loading…</Typography>
      ) : entries.length === 0 ? (
        <Typography color="text.secondary">No audit entries match these filters.</Typography>
      ) : (
        <Stack spacing={1}>
          {entries.map((e) => (
            <Card key={e.id}>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Badge variant="secondary">{e.action}</Badge>
                  <Badge variant="secondary">{e.resource_type}</Badge>
                  {e.resource_id && (
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {e.resource_id}
                    </Typography>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    {new Date(e.created_at).toLocaleString()}
                  </Typography>
                </Stack>
                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <pre
                    style={{
                      fontSize: 11,
                      marginTop: 8,
                      background: 'rgba(0,0,0,0.04)',
                      padding: 8,
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(e.metadata, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
