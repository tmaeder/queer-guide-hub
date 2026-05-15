import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  RefreshCw,
  Calendar as ScheduleIcon,
  AlertCircle,
  CheckCircle,
  Store,
  CalendarDays,
  Hotel,
  Globe,
  FileText,
  Building2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useScrapeSourcesManager, ScrapeSource, ScrapeRun } from '@/hooks/useScrapeSourcesManager';

const CONTENT_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> =
  {
    products: { icon: <Store size={14} />, color: '#9c27b0', label: 'Products' },
    events: { icon: <CalendarDays size={14} />, color: '#2196f3', label: 'Events' },
    accommodations: {
      icon: <Hotel size={14} />,
      color: '#ff9800',
      label: 'Accommodations',
    },
    cities: { icon: <Building2 size={14} />, color: '#4caf50', label: 'Cities' },
    queer_villages: {
      icon: <Building2 size={14} />,
      color: '#00bcd4',
      label: 'Queer Villages',
    },
    news: { icon: <FileText size={14} />, color: '#f44336', label: 'News' },
    countries: { icon: <Globe size={14} />, color: '#607d8b', label: 'Countries' },
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

export const ScrapeSourcesDashboard = () => {
  const { fetchSources, fetchRuns, toggleSource, triggerScrape, triggerAllDue, loading } =
    useScrapeSourcesManager();
  const [sources, setSources] = useState<ScrapeSource[]>([]);
  const [recentRuns, setRecentRuns] = useState<ScrapeRun[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [triggeringSlug, setTriggeringSlug] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadingSources(true);
    try {
      const [srcData, runData] = await Promise.all([fetchSources(), fetchRuns(undefined, 50)]);
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
    setSources((prev) =>
      prev.map((s) => (s.id === source.id ? { ...s, is_enabled: !s.is_enabled } : s)),
    );
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
  const enabledSources = sources.filter((s) => s.is_enabled).length;
  const failingSources = sources.filter((s) => s.consecutive_failures > 0).length;
  const totalItems = sources.reduce((sum, s) => sum + (s.total_items_fetched || 0), 0);

  if (loadingSources) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h5 className="text-2xl font-bold">Web Scraping Sources</h5>
          <p className="text-sm text-muted-foreground">
            {totalSources} sources ({enabledSources} enabled) &middot; {totalItems.toLocaleString()}{' '}
            total items fetched
            {failingSources > 0 && ` · ${failingSources} failing`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} size="sm">
            <RefreshCw size={14} />
            Refresh
          </Button>
          <Button onClick={handleTriggerAll} disabled={loading} size="sm">
            {loading ? (
              <Loader2 size={16} className="animate-spin" aria-label="Loading" />
            ) : (
              <ScheduleIcon size={14} />
            )}
            Run All Due
          </Button>
        </div>
      </div>

      {/* Stats chips */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {Object.entries(grouped).map(([type, srcs]) => {
          const config = CONTENT_TYPE_CONFIG[type] || {
            icon: <Globe size={14} />,
            color: '#999',
            label: type,
          };
          return (
            <Badge
              key={type}
              variant="outline"
              className="gap-1"
              style={{
                backgroundColor: config.color + '22',
                color: config.color,
                borderColor: config.color + '44',
              }}
            >
              {config.icon}
              {`${config.label}: ${srcs.length}`}
            </Badge>
          );
        })}
      </div>

      {/* Failing sources alert */}
      {failingSources > 0 && (
        <Alert className="mb-4 border-yellow-300 bg-yellow-50 text-yellow-900">
          <AlertDescription>
            {failingSources} source(s) have consecutive failures. Check the error column for details.
          </AlertDescription>
        </Alert>
      )}

      {/* Sources table */}
      <div className="border border-border rounded-element mb-8 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Runs</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => {
              const typeConfig = CONTENT_TYPE_CONFIG[source.content_type] || {
                icon: null,
                color: '#999',
                label: source.content_type,
              };
              const hasError = source.consecutive_failures > 0;

              return (
                <TableRow key={source.id} style={{ opacity: source.is_enabled ? 1 : 0.5 }}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-semibold">{source.name}</p>
                      <span className="text-xs text-muted-foreground break-all">
                        {source.url.replace(/^https?:\/\//, '').slice(0, 40)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-[0.7rem]"
                      style={{
                        backgroundColor: typeConfig.color + '22',
                        color: typeConfig.color,
                      }}
                    >
                      {typeConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">{source.scrape_method}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm">
                      {(source.total_items_fetched || 0).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm">{source.total_runs || 0}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">{formatRelativeTime(source.last_run_at)}</span>
                  </TableCell>
                  <TableCell>
                    {hasError ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="text-[0.65rem] gap-1 border-destructive text-destructive"
                          >
                            <AlertCircle size={12} />
                            {`${source.consecutive_failures} fails`}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{source.last_error || 'Unknown error'}</TooltipContent>
                      </Tooltip>
                    ) : source.last_success_at ? (
                      <Badge
                        variant="outline"
                        className="text-[0.65rem] gap-1 border-green-500 text-green-700"
                      >
                        <CheckCircle size={12} />
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[0.65rem]">
                        New
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={source.is_enabled}
                      onCheckedChange={() => handleToggle(source)}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleTrigger(source)}
                          disabled={triggeringSlug === source.slug || loading}
                        >
                          {triggeringSlug === source.slug ? (
                            <Loader2 size={16} className="animate-spin" aria-label="Loading" />
                          ) : (
                            <Play size={14} />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Run now</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Recent runs */}
      <h6 className="text-lg font-semibold mb-4">Recent Scrape Runs</h6>
      <div className="border border-border rounded-element overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Pages</TableHead>
              <TableHead className="text-right">Found</TableHead>
              <TableHead className="text-right">Staged</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentRuns.slice(0, 20).map((run) => {
              const source = sources.find((s) => s.id === run.source_id);
              const statusClass =
                run.status === 'completed'
                  ? 'border-green-500 text-green-700'
                  : run.status === 'running'
                    ? 'border-blue-500 text-blue-700'
                    : run.status === 'failed'
                      ? 'border-destructive text-destructive'
                      : '';
              return (
                <TableRow key={run.id}>
                  <TableCell>
                    <span className="text-sm">{source?.name || run.source_id.slice(0, 8)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[0.65rem] ${statusClass}`}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{run.pages_crawled}</TableCell>
                  <TableCell className="text-right">{run.items_found}</TableCell>
                  <TableCell className="text-right">{run.items_staged}</TableCell>
                  <TableCell>
                    <span className="text-xs">
                      {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">
                      {run.started_at ? formatRelativeTime(run.started_at) : '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {run.error_message && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-destructive max-w-[200px] truncate block">
                            {run.error_message.slice(0, 50)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{run.error_message}</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {recentRuns.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  <p className="text-sm text-muted-foreground py-4">
                    No scrape runs yet. Click "Run All Due" or trigger individual sources.
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
