import React, { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Summary Row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
              <Zap style={{ height: 20, width: 20, color: '#2563eb' }} />
              <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{sources.length}</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>Total Sources</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
              <CheckCircle style={{ height: 20, width: 20, color: '#16a34a' }} />
              <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{enabledCount}</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>Enabled</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
              <AlertTriangle style={{ height: 20, width: 20, color: '#dc2626' }} />
              <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{errorCount}</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>Errors</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
              <Database style={{ height: 20, width: 20, color: '#DB2777' }} />
              <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {sources.reduce((sum, s) => sum + (s.total_items_fetched || 0), 0).toLocaleString()}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>Total Items Fetched</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Refresh */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="outline" size="sm" onClick={loadSources} disabled={loading} style={{ display: 'flex', gap: 8 }}>
          <RefreshCw style={{ height: 16, width: 16, ...(loading ? { animation: 'spin 1s linear infinite' } : {}) }} />
          Refresh
        </Button>
      </Box>

      {/* Source Cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sources.map((source) => {
          const hasError = !!source.last_error;
          const needsKey = source.requires_api_key && !source.is_enabled;
          const isTriggering = triggeringId === source.id;

          return (
            <Card key={source.id} style={{
              backgroundColor: 'var(--card)',
              borderLeft: `4px solid ${hasError ? '#dc2626' : source.is_enabled ? '#16a34a' : '#6b7280'}`,
            }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                    <Box sx={{ p: 1, bgcolor: 'var(--muted)', borderRadius: 1 }}>
                      {SOURCE_TYPE_ICONS[source.source_type] || <Database style={{ height: 16, width: 16 }} />}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 600 }}>{source.name}</Typography>
                        <Badge variant={source.is_enabled ? 'default' : 'outline'}>
                          {source.is_enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <Badge variant="secondary">{source.source_type}</Badge>
                        <Badge variant="outline">{source.target_table}</Badge>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 3, fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Clock style={{ height: 12, width: 12 }} />
                          Last run: {formatRelativeTime(source.last_run_at)}
                        </Box>
                        {source.schedule && (
                          <span>Schedule: {source.schedule}</span>
                        )}
                        <span>Fetched: {(source.total_items_fetched || 0).toLocaleString()}</span>
                        <span>Approved: {(source.total_items_approved || 0).toLocaleString()}</span>
                        {source.requires_api_key && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#ca8a04' }}>
                            <Key style={{ height: 12, width: 12 }} />
                            {source.requires_api_key}
                          </Box>
                        )}
                      </Box>

                      {hasError && (
                        <Alert style={{ marginTop: 8, padding: '4px 8px' }}>
                          <AlertTriangle style={{ height: 14, width: 14 }} />
                          <AlertDescription style={{ fontSize: '0.75rem' }}>
                            {source.last_error}
                          </AlertDescription>
                        </Alert>
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
                  </Box>
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
};
