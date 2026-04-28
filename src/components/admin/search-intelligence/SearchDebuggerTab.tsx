import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { callSearchIntelligence, SearchDebugResult } from '@/hooks/useSearchIntelligence';

const DEFAULT_INDEXES = [
  'venues',
  'events',
  'cities',
  'countries',
  'news',
  'marketplace',
  'personalities',
  'tags',
  'queer_villages',
];

export function SearchDebuggerTab() {
  const [index, setIndex] = useState('venues');
  const [query, setQuery] = useState('gay bar berlin');
  const [filter, setFilter] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SearchDebugResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    const res = await callSearchIntelligence<SearchDebugResult>('search-debug', {
      method: 'POST',
      body: {
        index,
        query,
        filter: filter || undefined,
        showRankingScore: true,
        showRankingScoreDetails: true,
        limit: 20,
      },
    });
    if (!res.success) setError(res.error);
    else setResult(res.data);
    setRunning(false);
  };

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-end">
        <TextField
          select
          label="Index"
          value={index}
          onChange={(e) => setIndex(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          {DEFAULT_INDEXES.map((ix) => (
            <MenuItem key={ix} value={ix}>
              {ix}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
        />
        <TextField
          label="Meili filter"
          placeholder='e.g. country = "DE"'
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          fullWidth
        />
        <Button onClick={run} disabled={running || !query}>
          {running ? 'Running…' : 'Run'}
        </Button>
      </Stack>

      {error && <Typography color="error">{error}</Typography>}

      {result && (
        <>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Hits {result.summary.hits} / est. total {result.summary.estimatedTotal ?? '?'} ·
              meili {result.summary.processingTimeMs ?? '?'}ms · round-trip{' '}
              {result.summary.roundTripMs}ms
            </Typography>
          </Box>
          <Stack spacing={1}>
            {result.summary.topMatches.map((m, i) => (
              <Card key={i}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="subtitle2">
                        {String(m.title ?? '(no title)')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        id: {String(m.id ?? '—')}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontFeatureSettings: '"tnum"' }}>
                      {m.score == null ? '—' : m.score.toFixed(3)}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
          <details>
            <summary style={{ cursor: 'pointer' }}>Raw response</summary>
            <pre
              style={{
                fontSize: 12,
                maxHeight: 400,
                overflow: 'auto',
                background: 'rgba(0,0,0,0.04)',
                padding: 12,
              }}
            >
              {JSON.stringify(result.raw, null, 2)}
            </pre>
          </details>
        </>
      )}
    </Stack>
  );
}
