/**
 * DataQualityDashboard — per-content-type health metrics for the CMS.
 * Counts use HEAD queries to keep Supabase egress flat.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import { RefreshCw, AlertTriangle, CheckCircle2, FileText, Clock, Languages } from 'lucide-react';
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
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Data Quality
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Health metrics across all content types — refresh to recompute.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshCw size={14} />}
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Refresh
        </Button>
      </Box>

      {/* Summary tiles */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' },
          gap: 1.5,
          mb: 3,
        }}
      >
        <SummaryTile label="Total items" value={totals.total} icon={FileText} color="#64748b" />
        <SummaryTile
          label="Published"
          value={totals.published}
          icon={CheckCircle2}
          color="#10b981"
        />
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
      </Box>

      {loading && rows.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} aria-label="Loading" />
        </Box>
      ) : (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: 'background.paper',
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '2fr repeat(6, 1fr)',
              px: 2,
              py: 1.25,
              bgcolor: 'grey.50',
              borderBottom: '1px solid',
              borderColor: 'divider',
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'text.secondary',
            }}
          >
            <Box>Type</Box>
            <Box sx={{ textAlign: 'right' }}>Total</Box>
            <Box sx={{ textAlign: 'right' }}>Published</Box>
            <Box sx={{ textAlign: 'right' }}>Draft</Box>
            <Box sx={{ textAlign: 'right' }}>Missing req.</Box>
            <Box sx={{ textAlign: 'right' }}>Stale</Box>
            <Box sx={{ textAlign: 'right' }}>Untranslated</Box>
          </Box>
          {rows.map((row) => (
            <QualityRowView key={row.id} row={row} />
          ))}
        </Box>
      )}

      {rows.some((r) => r.error) && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Some types failed to load metrics. Errors:{' '}
          {rows
            .filter((r) => r.error)
            .map((r) => `${r.label} (${r.error})`)
            .join('; ')}
        </Alert>
      )}
    </Box>
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
    <Box
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Icon size={14} color={color} />
        <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
          {label}
        </Typography>
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 700, color }}>
        {value.toLocaleString()}
      </Typography>
    </Box>
  );
}

function QualityRowView({ row }: { row: QualityRow }) {
  const cell = (n: number, warn = false) => (
    <Box
      sx={{
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        color: warn && n > 0 ? 'error.main' : 'text.primary',
        fontWeight: warn && n > 0 ? 600 : 400,
      }}
    >
      {n.toLocaleString()}
    </Box>
  );
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '2fr repeat(6, 1fr)',
        px: 2,
        py: 1.25,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-child': { borderBottom: 'none' },
        fontSize: '0.85rem',
        alignItems: 'center',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: row.color,
            flexShrink: 0,
          }}
        />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {row.label}
        </Typography>
        {row.error && (
          <Tooltip title={row.error}>
            <AlertTriangle size={14} color="#ef4444" />
          </Tooltip>
        )}
      </Box>
      {cell(row.total)}
      {cell(row.published)}
      {cell(row.draft)}
      {cell(row.missingRequired, true)}
      {cell(row.staleCount, true)}
      {cell(row.untranslated, true)}
    </Box>
  );
}
