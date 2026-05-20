import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useImportHub, IngestionSource } from '@/hooks/useImportHub';
import {
  Play, RefreshCw, AlertTriangle, CheckCircle, Clock,
  Database, Globe, Rss, FileText, Zap, Key
} from 'lucide-react';

const SOURCE_TYPE_ICONS: Record<string, React.ReactNode> = {
  api: <Database style={{ height: 16, width: 16 }} />,
  scraper: <Globe style={{ height: 16, width: 16 }} />,
  rss: <Rss style={{ height: 16, width: 16 }} />,
  csv: <FileText style={{ height: 16, width: 16 }} />,
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

export const IngestionSourcesManager = () => {
  const { fetchSources, toggleSource, triggerSource } = useImportHub();

  const [sources, setSources] = useState<IngestionSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSources();
      setSources(data);
    } finally {
      setLoading(false);
    }
  }, [fetchSources]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleToggle = async (source: IngestionSource) => {
    await toggleSource(source.id, !source.is_enabled);
    await loadSources();
  };

  const handleTrigger = async (source: IngestionSource) => {
    setTriggeringId(source.id);
    try {
      await triggerSource(source);
      await loadSources();
    } finally {
      setTriggeringId(null);
    }
  };

  const enabledCount = sources.filter(s => s.is_enabled).length;
  const errorCount = sources.filter(s => s.last_error).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-center gap-2 mb-1">
              <Zap style={{ height: 20, width: 20, color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-2xl font-bold">{sources.length}</span>
            </div>
            <p className="text-xs text-muted-foreground">Total Sources</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle style={{ height: 20, width: 20, color: 'hsl(var(--foreground))' }} />
              <span className="text-2xl font-bold">{enabledCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Enabled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center justify-center gap-2 mb-1">
              <AlertTriangle style={{ height: 20, width: 20, color: 'hsl(var(--destructive))' }} />
              <span className="text-2xl font-bold">{errorCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Errors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center justify-center gap-2 mb-1">
              <Database style={{ height: 20, width: 20, color: 'hsl(var(--foreground))' }} />
              <span className="text-2xl font-bold">
                {sources.reduce((sum, s) => sum + (s.total_items_fetched || 0), 0).toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Total Items Fetched</p>
          </CardContent>
        </Card>
      </div>

      {/* Refresh */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={loadSources} disabled={loading} style={{ display: 'flex', gap: 8 }}>
          <RefreshCw style={{ height: 16, width: 16, ...(loading ? { animation: 'spin 1s linear infinite' } : {}) }} />
          Refresh
        </Button>
      </div>

      {/* Source Cards */}
      <div className="flex flex-col gap-4">
        {sources.map((source) => {
          const hasError = !!source.last_error;
          const isTriggering = triggeringId === source.id;

          return (
            <Card key={source.id} style={{
              backgroundColor: 'var(--card)',
              borderLeft: `4px solid ${hasError ? 'hsl(var(--destructive))' : source.is_enabled ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'}`,
            }}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="p-2 bg-muted rounded">
                      {SOURCE_TYPE_ICONS[source.source_type] || <Database style={{ height: 16, width: 16 }} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-semibold">{source.name}</p>
                        <Badge variant={source.is_enabled ? 'default' : 'outline'}>
                          {source.is_enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <Badge variant="secondary">{source.source_type}</Badge>
                        <Badge variant="outline">{source.target_table}</Badge>
                      </div>
                      <div className="flex gap-6 text-muted-foreground" style={{ fontSize: '0.8rem' }}>
                        <div className="flex items-center gap-1">
                          <Clock style={{ height: 12, width: 12 }} />
                          Last run: {formatRelativeTime(source.last_run_at)}
                        </div>
                        {source.schedule && (
                          <span>Schedule: {source.schedule}</span>
                        )}
                        <span>Fetched: {(source.total_items_fetched || 0).toLocaleString()}</span>
                        <span>Approved: {(source.total_items_approved || 0).toLocaleString()}</span>
                        {source.requires_api_key && (
                          <div className="flex items-center gap-1" style={{ color: 'hsl(var(--foreground) / 0.55)' }}>
                            <Key style={{ height: 12, width: 12 }} />
                            {source.requires_api_key}
                          </div>
                        )}
                      </div>

                      {hasError && (
                        <Alert style={{ marginTop: 8, padding: '4px 8px' }}>
                          <AlertTriangle style={{ height: 14, width: 14 }} />
                          <AlertDescription style={{ fontSize: '0.75rem' }}>
                            {source.last_error}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Switch
                      checked={source.is_enabled}
                      onCheckedChange={() => handleToggle(source)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!source.is_enabled || isTriggering}
                      onClick={() => handleTrigger(source)}
                      style={{ display: 'flex', gap: 6 }}
                    >
                      {isTriggering ? (
                        <RefreshCw style={{ height: 14, width: 14, animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Play style={{ height: 14, width: 14 }} />
                      )}
                      Run Now
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
