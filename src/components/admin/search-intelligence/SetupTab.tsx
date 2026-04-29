import { useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { callSearchIntelligence } from '@/hooks/useSearchIntelligence';

type Status = 'ok' | 'warn' | 'fail' | 'na';

interface Check {
  category: string;
  name: string;
  status: Status;
  detail: string;
}

interface SetupStatus {
  summary: { ok: number; warn: number; fail: number; na: number };
  checks: Check[];
  runtime: {
    meili_configured: boolean;
    function_env: Record<string, boolean>;
  };
}

const STATUS_VARIANT: Record<Status, 'default' | 'secondary' | 'destructive'> = {
  ok: 'default',
  warn: 'secondary',
  fail: 'destructive',
  na: 'secondary',
};

const STATUS_LABEL: Record<Status, string> = {
  ok: '✓',
  warn: '!',
  fail: '✗',
  na: '–',
};

const CATEGORY_ORDER = [
  'extension',
  'table',
  'column',
  'function',
  'view',
  'cron',
  'guc',
  'env',
  'data',
];

export function SetupTab() {
  const [data, setData] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await callSearchIntelligence<SetupStatus>('setup-status');
    if (!res.success) setError(res.error);
    else {
      setData(res.data);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading && !data) return <Typography>Loading…</Typography>;
  if (error) {
    return (
      <Alert severity="error">
        <Typography variant="body2">{error}</Typography>
        <Typography variant="caption">
          The /setup-status endpoint is admin-only. If you see "Not found", redeploy the
          search-intelligence edge function and re-apply the verify_search_intelligence_install
          migration.
        </Typography>
      </Alert>
    );
  }
  if (!data) return null;

  const total =
    data.summary.ok + data.summary.warn + data.summary.fail + data.summary.na;
  const okPct = total === 0 ? 0 : Math.round((data.summary.ok / total) * 100);

  // Group checks by category, ordered.
  const grouped = new Map<string, Check[]>();
  for (const c of data.checks) {
    const arr = grouped.get(c.category) ?? [];
    arr.push(c);
    grouped.set(c.category, arr);
  }
  const categories = [
    ...CATEGORY_ORDER.filter((c) => grouped.has(c)),
    ...[...grouped.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ md: 'center' }}
            spacing={2}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6">Install status</Typography>
              <Typography variant="body2" color="text.secondary">
                Self-test for the Search Intelligence rollup. Re-runnable; no
                writes.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Badge variant="default">{data.summary.ok} ok</Badge>
              <Badge variant="secondary">{data.summary.warn} warn</Badge>
              <Badge variant="destructive">{data.summary.fail} fail</Badge>
              <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
                Refresh
              </Button>
            </Stack>
          </Stack>
          <Box sx={{ mt: 2 }}>
            <LinearProgress
              variant="determinate"
              value={okPct}
              sx={{
                height: 6,
                backgroundColor: 'rgba(0,0,0,0.06)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor:
                    data.summary.fail > 0
                      ? '#ef4444'
                      : data.summary.warn > 0
                        ? '#f59e0b'
                        : '#10b981',
                },
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {okPct}% of checks passing ({data.summary.ok} of {total})
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {data.summary.fail > 0 && (
        <Alert severity="error">
          {data.summary.fail} check(s) failing. Most common causes: a migration didn't apply,
          a webhook secret isn't set, or an edge function isn't redeployed. See the per-check
          detail below.
        </Alert>
      )}

      {categories.map((cat) => {
        const checks = grouped.get(cat) ?? [];
        return (
          <Card key={cat}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', mb: 1.5 }}>
                {cat}{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  ({checks.length})
                </Typography>
              </Typography>
              <Stack spacing={0.5}>
                {checks.map((c) => (
                  <Stack
                    key={`${c.category}-${c.name}`}
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    sx={{ fontFamily: 'monospace', fontSize: 13 }}
                  >
                    <Badge variant={STATUS_VARIANT[c.status]}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                    <Box sx={{ minWidth: 280, flexShrink: 0 }}>{c.name}</Box>
                    <Box sx={{ flex: 1, color: 'text.secondary' }}>{c.detail}</Box>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
