import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

  if (loading && !data) return <p>Loading…</p>;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <p className="text-sm">{error}</p>
          <p className="text-xs">
            The /setup-status endpoint is admin-only. If you see "Not found", redeploy the
            search-intelligence edge function and re-apply the verify_search_intelligence_install
            migration.
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;

  const total =
    data.summary.ok + data.summary.warn + data.summary.fail + data.summary.na;
  const okPct = total === 0 ? 0 : Math.round((data.summary.ok / total) * 100);

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

  const barColor = data.summary.fail > 0 ? 'hsl(var(--destructive))' : data.summary.warn > 0 ? 'hsl(var(--foreground) / 0.55)' : 'hsl(var(--foreground))';

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div className="flex-1">
              <h6 className="text-base font-semibold">Install status</h6>
              <p className="text-sm text-muted-foreground">
                Self-test for the Search Intelligence rollup. Re-runnable; no writes.
              </p>
            </div>
            <div className="flex flex-row gap-2 items-center">
              <Badge variant="default">{data.summary.ok} ok</Badge>
              <Badge variant="secondary">{data.summary.warn} warn</Badge>
              <Badge variant="destructive">{data.summary.fail} fail</Badge>
              <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
                Refresh
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}>
              <div className="h-full" style={{ width: `${okPct}%`, backgroundColor: barColor }} />
            </div>
            <span className="text-xs text-muted-foreground mt-1 block">
              {okPct}% of checks passing ({data.summary.ok} of {total})
            </span>
          </div>
        </CardContent>
      </Card>

      {data.summary.fail > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {data.summary.fail} check(s) failing. Most common causes: a migration didn't apply,
            a webhook secret isn't set, or an edge function isn't redeployed. See the per-check
            detail below.
          </AlertDescription>
        </Alert>
      )}

      {categories.map((cat) => {
        const checks = grouped.get(cat) ?? [];
        return (
          <Card key={cat}>
            <CardContent>
              <p className="text-sm font-semibold uppercase mb-3">
                {cat}{' '}
                <span className="text-xs text-muted-foreground">
                  ({checks.length})
                </span>
              </p>
              <div className="flex flex-col gap-1">
                {checks.map((c) => (
                  <div
                    key={`${c.category}-${c.name}`}
                    className="flex flex-row gap-4 items-center font-mono text-[13px]"
                  >
                    <Badge variant={STATUS_VARIANT[c.status]}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                    <div className="min-w-[280px] shrink-0">{c.name}</div>
                    <div className="flex-1 text-muted-foreground">{c.detail}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
