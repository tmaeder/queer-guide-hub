/**
 * DataQualityDashboard — per-content-type health metrics for the CMS.
 * Counts use HEAD queries to keep Supabase egress flat.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { RefreshCw, AlertTriangle, CheckCircle2, FileText, Clock, Languages, Loader2 } from 'lucide-react';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import {
  loadDataQualityRow,
  DATA_QUALITY_STALE_DAYS as STALE_DAYS,
  type DataQualityRow as QualityRow,
} from '@/hooks/useDataQualityDashboard';

export function DataQualityDashboard() {
  const [rows, setRows] = useState<QualityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const configs = useMemo(() => Object.values(contentTypeRegistry), []);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(configs.map((c) => loadDataQualityRow(c)));
    setRows(results.sort((a, b) => b.total - a.total));
    setLoading(false);
  }, [configs]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const totals = useMemo(() => {
    const t = { total: 0, published: 0, missingRequired: 0, stale: 0, untranslated: 0 };
    for (const r of rows) {
      t.total += r.total;
      t.published += r.published;
      t.missingRequired += r.missingRequired;
      t.stale += r.staleCount;
      t.untranslated += r.untranslated;
    }
    return t;
  }, [rows]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold mb-1">Data Quality</h2>
          <p className="text-sm text-muted-foreground">
            Health metrics across all content types — refresh to recompute.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="font-semibold"
        >
          <RefreshCw size={14} className="mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <SummaryTile label="Total items" value={totals.total} icon={FileText} color="#64748b" />
        <SummaryTile label="Published" value={totals.published} icon={CheckCircle2} color="#10b981" />
        <SummaryTile
          label="Missing required"
          value={totals.missingRequired}
          icon={AlertTriangle}
          color={totals.missingRequired > 0 ? '#ef4444' : '#94a3b8'}
        />
        <SummaryTile
          label={`Stale > ${STALE_DAYS}d`}
          value={totals.stale}
          icon={Clock}
          color={totals.stale > 0 ? '#f59e0b' : '#94a3b8'}
        />
        <SummaryTile
          label="Untranslated fields"
          value={totals.untranslated}
          icon={Languages}
          color={totals.untranslated > 0 ? '#8b5cf6' : '#94a3b8'}
        />
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" aria-label="Loading" />
        </div>
      ) : (
        <div className="border border-border rounded-element overflow-hidden bg-background">
          <div
            className="grid px-4 py-2.5 bg-muted border-b border-border text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground"
            style={{ gridTemplateColumns: '2fr repeat(6, 1fr)' }}
          >
            <div>Type</div>
            <div className="text-right">Total</div>
            <div className="text-right">Published</div>
            <div className="text-right">Draft</div>
            <div className="text-right">Missing req.</div>
            <div className="text-right">Stale</div>
            <div className="text-right">Untranslated</div>
          </div>
          <TooltipProvider>
            {rows.map((row) => (
              <QualityRowView key={row.id} row={row} />
            ))}
          </TooltipProvider>
        </div>
      )}

      {rows.some((r) => r.error) && (
        <Alert className="mt-4 border-yellow-500 text-yellow-700 dark:text-yellow-400">
          <AlertDescription>
            Some types failed to load metrics. Errors:{' '}
            {rows
              .filter((r) => r.error)
              .map((r) => `${r.label} (${r.error})`)
              .join('; ')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof FileText;
  color: string;
}) {
  return (
    <div className="p-3 border border-border rounded-element bg-background flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon size={14} color={color} />
        <p className="text-[0.7rem] text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function QualityRowView({ row }: { row: QualityRow }) {
  const cell = (n: number, warn = false) => (
    <div
      className="text-right tabular-nums"
      style={{
        color: warn && n > 0 ? 'hsl(var(--destructive))' : undefined,
        fontWeight: warn && n > 0 ? 600 : 400,
      }}
    >
      {n.toLocaleString()}
    </div>
  );
  return (
    <div
      className="grid px-4 py-2.5 border-b border-border last:border-b-0 text-sm items-center hover:bg-muted/50"
      style={{ gridTemplateColumns: '2fr repeat(6, 1fr)' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: row.color }}
        />
        <p className="text-sm font-semibold">{row.label}</p>
        {row.error && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span><AlertTriangle size={14} color="#ef4444" /></span>
            </TooltipTrigger>
            <TooltipContent>{row.error}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {cell(row.total)}
      {cell(row.published)}
      {cell(row.draft)}
      {cell(row.missingRequired, true)}
      {cell(row.staleCount, true)}
      {cell(row.untranslated, true)}
    </div>
  );
}
