import React, { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StorefrontIcon from '@mui/icons-material/Storefront';
import EventIcon from '@mui/icons-material/Event';
import HotelIcon from '@mui/icons-material/Hotel';
import PublicIcon from '@mui/icons-material/Public';
import ArticleIcon from '@mui/icons-material/Article';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import { useScrapeSourcesManager, ScrapeSource, ScrapeRun } from '@/hooks/useScrapeSourcesManager';

const CONTENT_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  products: { icon: <StorefrontIcon fontSize="small" />, color: '#9c27b0', label: 'Products' },
  events: { icon: <EventIcon fontSize="small" />, color: '#2196f3', label: 'Events' },
  accommodations: { icon: <HotelIcon fontSize="small" />, color: '#ff9800', label: 'Accommodations' },
  cities: { icon: <LocationCityIcon fontSize="small" />, color: '#4caf50', label: 'Cities' },
  queer_villages: { icon: <LocationCityIcon fontSize="small" />, color: '#00bcd4', label: 'Queer Villages' },
  news: { icon: <ArticleIcon fontSize="small" />, color: '#f44336', label: 'News' },
  countries: { icon: <PublicIcon fontSize="small" />, color: '#607d8b', label: 'Countries' },
};

function formatRelativeTime(date: string | null): string {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const ScrapeSourcesDashboard: React.FC = () => {
  const { fetchSources, fetchRuns, toggleSource, triggerScrape, triggerAllDue, loading } = useScrapeSourcesManager();
  const [sources, setSources] = useState<ScrapeSource[]>([]);
  const [recentRuns, setRecentRuns] = useState<ScrapeRun[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [triggeringSlug, setTriggeringSlug] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadingSources(true);
    try {
      const [srcData, runData] = await Promise.all([
        fetchSources(),
        fetchRuns(undefined, 50),
      ]);
      setSources(srcData);
      setRecentRuns(runData);
    } finally {
      setLoadingSources(false);
    }
  }, [fetchSources, fetchRuns]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = async (source: ScrapeSource) => {
    await toggleSource(source.id, !source.is_enabled);
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, is_enabled: !s.is_enabled } : s));
  };

  const handleTrigger = async (source: ScrapeSource) => {
    setTriggeringSlug(source.slug);
    await triggerScrape(source);
    setTriggeringSlug(null);
    loadData();
  };

  const handleTriggerAll = async () => {
    await triggerAllDue();
    loadData();
  };

  // Group sources by content type
  const grouped = sources.reduce<Record<string, ScrapeSource[]>>((acc, s) => {
    (acc[s.content_type] = acc[s.content_type] || []).push(s);
    return acc;
  }, {});

  const totalSources = sources.length;
  const enabledSources = sources.filter(s => s.is_enabled).length;
  const failingSources = sources.filter(s => s.consecutive_failures > 0).length;
  const totalItems = sources.reduce((sum, s) => sum + (s.total_items_fetched || 0), 0);

  if (loadingSources) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Web Scraping Sources</Typography>
          <Typography variant="body2" color="text.secondary">
            {totalSources} sources ({enabledSources} enabled) &middot; {totalItems.toLocaleString()} total items fetched
            {failingSources > 0 && ` · ${failingSources} failing`}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadData}
            size="small"
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} /> : <ScheduleIcon />}
            onClick={handleTriggerAll}
            disabled={loading}
            size="small"
          >
            Run All Due
          </Button>
        </Box>
      </Box>

      {/* Stats chips */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {Object.entries(grouped).map(([type, srcs]) => {
          const config = CONTENT_TYPE_CONFIG[type] || { icon: <PublicIcon fontSize="small" />, color: '#999', label: type };
          return (
            <Chip
              key={type}
              icon={config.icon as React.ReactElement}
              label={`${config.label}: ${srcs.length}`}
              size="small"
              sx={{ bgcolor: config.color + '22', color: config.color, borderColor: config.color + '44' }}
              variant="outlined"
            />
          );
        })}
      </Box>

      {/* Failing sources alert */}
      {failingSources > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {failingSources} source(s) have consecutive failures. Check the error column for details.
        </Alert>
      )}

      {/* Sources table */}
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Source</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Method</TableCell>
              <TableCell align="right">Items</TableCell>
              <TableCell align="right">Runs</TableCell>
              <TableCell>Last Run</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Enabled</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sources.map(source => {
              const typeConfig = CONTENT_TYPE_CONFIG[source.content_type] || { icon: null, color: '#999', label: source.content_type };
              const hasError = source.consecutive_failures > 0;

              return (
                <TableRow key={source.id} sx={{ opacity: source.is_enabled ? 1 : 0.5 }}>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{source.name}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                        {source.url.replace(/^https?:\/\//, '').slice(0, 40)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={typeConfig.label}
                      sx={{ fontSize: '0.7rem', bgcolor: typeConfig.color + '22', color: typeConfig.color }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{source.scrape_method}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{(source.total_items_fetched || 0).toLocaleString()}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{source.total_runs || 0}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {formatRelativeTime(source.last_run_at)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {hasError ? (
                      <Tooltip title={source.last_error || 'Unknown error'}>
                        <Chip
                          icon={<ErrorIcon />}
                          label={`${source.consecutive_failures} fails`}
                          size="small"
                          color="error"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem' }}
                        />
                      </Tooltip>
                    ) : source.last_success_at ? (
                      <Chip
                        icon={<CheckCircleIcon />}
                        label="OK"
                        size="small"
                        color="success"
                        variant="outlined"
                        sx={{ fontSize: '0.65rem' }}
                      />
                    ) : (
                      <Chip label="New" size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={source.is_enabled}
                      onChange={() => handleToggle(source)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Run now">
                      <IconButton
                        size="small"
                        onClick={() => handleTrigger(source)}
                        disabled={triggeringSlug === source.slug || loading}
                      >
                        {triggeringSlug === source.slug ? (
                          <CircularProgress size={16} />
                        ) : (
                          <PlayArrowIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Recent runs */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Recent Scrape Runs</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Source</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Pages</TableCell>
              <TableCell align="right">Found</TableCell>
              <TableCell align="right">Staged</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Started</TableCell>
              <TableCell>Error</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recentRuns.slice(0, 20).map(run => {
              const source = sources.find(s => s.id === run.source_id);
              return (
                <TableRow key={run.id}>
                  <TableCell>
                    <Typography variant="body2">{source?.name || run.source_id.slice(0, 8)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={run.status}
                      size="small"
                      color={
                        run.status === 'completed' ? 'success' :
                        run.status === 'running' ? 'info' :
                        run.status === 'failed' ? 'error' : 'default'
                      }
                      variant="outlined"
                      sx={{ fontSize: '0.65rem' }}
                    />
                  </TableCell>
                  <TableCell align="right">{run.pages_crawled}</TableCell>
                  <TableCell align="right">{run.items_found}</TableCell>
                  <TableCell align="right">{run.items_staged}</TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {run.started_at ? formatRelativeTime(run.started_at) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {run.error_message && (
                      <Tooltip title={run.error_message}>
                        <Typography variant="caption" color="error" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                          {run.error_message.slice(0, 50)}
                        </Typography>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {recentRuns.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No scrape runs yet. Click "Run All Due" or trigger individual sources.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
