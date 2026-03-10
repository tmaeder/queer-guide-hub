import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Box, Typography } from '@mui/material';
import { api } from '@/integrations/api/client';
import {
  Mail,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Calendar,
  Building,
  AlertCircle,
  Clock,
  Search,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface EmailIngestion {
  id: string;
  from_address: string;
  to_address: string;
  subject: string;
  received_at: string;
  body_text: string | null;
  extracted_events: number;
  extracted_venues: number;
  inserted_event_ids: string[];
  inserted_venue_ids: string[];
  ai_extraction: any;
  status: string;
  error_message: string | null;
  processing_ms: number | null;
  created_at: string;
}

type StatusFilter = 'all' | 'completed' | 'failed' | 'no_content' | 'processing';

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  completed: 'default',
  failed: 'destructive',
  processing: 'secondary',
  no_content: 'outline',
};

const STATUS_BORDER_COLOR: Record<string, string> = {
  completed: '#16a34a',
  failed: '#dc2626',
  processing: '#ca8a04',
  no_content: '#6b7280',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function EmailIngestionsManager() {
  const { toast } = useToast();
  const [ingestions, setIngestions] = useState<EmailIngestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedJson, setExpandedJson] = useState<Set<string>>(new Set());

  const fetchIngestions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await api
        .from('email_ingestions' as never)
        .select('*')
        .order('received_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setIngestions((data as EmailIngestion[]) || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch email ingestions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchIngestions();
  }, [fetchIngestions]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleJson = (id: string) => {
    setExpandedJson((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filtering
  const filtered = ingestions.filter((ing) => {
    if (statusFilter !== 'all' && ing.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return ing.subject.toLowerCase().includes(q) || ing.from_address.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const totalCount = ingestions.length;
  const completedCount = ingestions.filter((i) => i.status === 'completed').length;
  const failedCount = ingestions.filter((i) => i.status === 'failed').length;
  const processingCount = ingestions.filter((i) => i.status === 'processing').length;

  if (loading) {
    return (
      <Box sx={{ textAlign: 'center', p: 4 }}>
        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
          Loading email ingestions...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Mail style={{ height: 24, width: 24, color: '#ec4899' }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Email Ingestions
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
              Forwarded emails processed for LGBTQ+ events and venues
            </Typography>
          </Box>
        </Box>
        <Button variant="outline" size="sm" onClick={fetchIngestions}>
          <RefreshCw style={{ height: 14, width: 14, marginRight: 6 }} />
          Refresh
        </Button>
      </Box>

      {/* Stats grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
        }}
      >
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Box sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalCount}</Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
              Total
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Box sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>
              {completedCount}
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
              Completed
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Box sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{failedCount}</Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
              Failed
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Box sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#ca8a04' }}>
              {processingCount}
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
              Processing
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Search and filters */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
        <Box sx={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              height: 14,
              width: 14,
              color: '#9ca3af',
            }}
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by subject or sender..."
            style={{ paddingLeft: 32 }}
          />
        </Box>
        {(['all', 'completed', 'failed', 'no_content', 'processing'] as StatusFilter[]).map(
          (filter) => (
            <Button
              key={filter}
              variant={statusFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(filter)}
            >
              {filter === 'all'
                ? 'All'
                : filter === 'no_content'
                  ? 'No Content'
                  : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Button>
          ),
        )}
      </Box>

      {/* Ingestion list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent style={{ padding: 32 }}>
            <Box sx={{ textAlign: 'center', color: 'var(--muted-foreground)' }}>
              <Mail style={{ height: 40, width: 40, margin: '0 auto 12px', opacity: 0.4 }} />
              <Typography variant="body2">
                {ingestions.length === 0
                  ? 'No email ingestions yet. Forward emails to ingest@queer.guide to get started.'
                  : 'No ingestions match your filters.'}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filtered.map((ing) => (
            <Collapsible key={ing.id}>
              <Card
                style={{
                  borderLeft: `4px solid ${STATUS_BORDER_COLOR[ing.status] || '#6b7280'}`,
                  transition: 'border-color 0.2s',
                }}
              >
                <CardContent style={{ padding: 14 }}>
                  {/* Summary row */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                    }}
                  >
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}
                    >
                      <Badge variant={STATUS_BADGE_VARIANT[ing.status] || 'outline'}>
                        {ing.status === 'no_content' ? 'no content' : ing.status}
                      </Badge>
                      <Box
                        component="span"
                        sx={{
                          fontWeight: 500,
                          fontSize: '0.875rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ing.subject}
                      </Box>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        flexShrink: 0,
                        fontSize: '0.75rem',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      <Box
                        component="span"
                        sx={{ display: { xs: 'none', md: 'inline' } }}
                        title={ing.from_address}
                      >
                        {ing.from_address.length > 24
                          ? ing.from_address.slice(0, 24) + '...'
                          : ing.from_address}
                      </Box>

                      {ing.status === 'completed' && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {ing.extracted_events > 0 && (
                            <Badge variant="outline" style={{ fontSize: '0.7rem' }}>
                              <Calendar style={{ height: 10, width: 10, marginRight: 3 }} />
                              {ing.extracted_events}
                            </Badge>
                          )}
                          {ing.extracted_venues > 0 && (
                            <Badge variant="outline" style={{ fontSize: '0.7rem' }}>
                              <Building style={{ height: 10, width: 10, marginRight: 3 }} />
                              {ing.extracted_venues}
                            </Badge>
                          )}
                        </Box>
                      )}

                      {ing.processing_ms != null && (
                        <Box
                          component="span"
                          sx={{ display: { xs: 'none', sm: 'inline' } }}
                          title="Processing time"
                        >
                          <Clock
                            style={{
                              height: 10,
                              width: 10,
                              display: 'inline',
                              marginRight: 2,
                              verticalAlign: 'middle',
                            }}
                          />
                          {ing.processing_ms < 1000
                            ? `${ing.processing_ms}ms`
                            : `${(ing.processing_ms / 1000).toFixed(1)}s`}
                        </Box>
                      )}

                      <Box component="span" title={new Date(ing.received_at).toLocaleString()}>
                        {relativeTime(ing.received_at)}
                      </Box>

                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRow(ing.id)}
                          style={{ padding: 4 }}
                        >
                          {expandedRows.has(ing.id) ? (
                            <ChevronUp style={{ height: 16, width: 16 }} />
                          ) : (
                            <ChevronDown style={{ height: 16, width: 16 }} />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </Box>
                  </Box>

                  {/* Expanded detail */}
                  <CollapsibleContent style={{ marginTop: 16 }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 2,
                        fontSize: '0.85rem',
                      }}
                    >
                      <Box>
                        <Box component="span" sx={{ fontWeight: 500 }}>
                          From:
                        </Box>
                        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                          {ing.from_address}
                        </Typography>
                      </Box>
                      <Box>
                        <Box component="span" sx={{ fontWeight: 500 }}>
                          Received:
                        </Box>
                        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                          {new Date(ing.received_at).toLocaleString()}
                        </Typography>
                      </Box>
                      <Box sx={{ gridColumn: { md: 'span 2' } }}>
                        <Box component="span" sx={{ fontWeight: 500 }}>
                          Subject:
                        </Box>
                        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                          {ing.subject}
                        </Typography>
                      </Box>

                      {/* AI Summary */}
                      {ing.ai_extraction?.summary && (
                        <Box sx={{ gridColumn: { md: 'span 2' } }}>
                          <Box component="span" sx={{ fontWeight: 500 }}>
                            AI Summary:
                          </Box>
                          <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                            {ing.ai_extraction.summary}
                          </Typography>
                        </Box>
                      )}

                      {/* Error message */}
                      {ing.error_message && (
                        <Box sx={{ gridColumn: { md: 'span 2' } }}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 1,
                              p: 1.5,
                              borderRadius: 1,
                              bgcolor: 'rgba(220, 38, 38, 0.08)',
                              border: '1px solid rgba(220, 38, 38, 0.2)',
                            }}
                          >
                            <AlertCircle
                              style={{
                                height: 14,
                                width: 14,
                                color: '#dc2626',
                                marginTop: 2,
                                flexShrink: 0,
                              }}
                            />
                            <Typography
                              variant="body2"
                              sx={{ color: '#dc2626', wordBreak: 'break-word' }}
                            >
                              {ing.error_message}
                            </Typography>
                          </Box>
                        </Box>
                      )}

                      {/* Extracted events */}
                      {ing.ai_extraction?.events?.length > 0 && (
                        <Box sx={{ gridColumn: { md: 'span 2' } }}>
                          <Box component="span" sx={{ fontWeight: 500 }}>
                            Extracted Events ({ing.ai_extraction.events.length}):
                          </Box>
                          <Box
                            sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 0.5,
                              mt: 0.5,
                            }}
                          >
                            {ing.ai_extraction.events.map((ev: any, i: number) => (
                              <Box
                                key={i}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  fontSize: '0.8rem',
                                  color: 'var(--muted-foreground)',
                                }}
                              >
                                <Calendar style={{ height: 12, width: 12, flexShrink: 0 }} />
                                <span>
                                  <strong>{ev.title}</strong> — {ev.city}, {ev.country}
                                  {ev.start_date &&
                                    ` (${new Date(ev.start_date).toLocaleDateString()})`}
                                </span>
                                <Badge variant="outline" style={{ fontSize: '0.65rem' }}>
                                  {ev.event_type}
                                </Badge>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}

                      {/* Extracted venues */}
                      {ing.ai_extraction?.venues?.length > 0 && (
                        <Box sx={{ gridColumn: { md: 'span 2' } }}>
                          <Box component="span" sx={{ fontWeight: 500 }}>
                            Extracted Venues ({ing.ai_extraction.venues.length}):
                          </Box>
                          <Box
                            sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 0.5,
                              mt: 0.5,
                            }}
                          >
                            {ing.ai_extraction.venues.map((v: any, i: number) => (
                              <Box
                                key={i}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  fontSize: '0.8rem',
                                  color: 'var(--muted-foreground)',
                                }}
                              >
                                <Building style={{ height: 12, width: 12, flexShrink: 0 }} />
                                <span>
                                  <strong>{v.name}</strong> — {v.address}, {v.city}
                                </span>
                                <Badge variant="outline" style={{ fontSize: '0.65rem' }}>
                                  {v.category}
                                </Badge>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}

                      {/* Body preview */}
                      {ing.body_text && (
                        <Box sx={{ gridColumn: { md: 'span 2' } }}>
                          <Box component="span" sx={{ fontWeight: 500 }}>
                            Body Preview:
                          </Box>
                          <Typography
                            variant="body2"
                            sx={{
                              color: 'var(--muted-foreground)',
                              whiteSpace: 'pre-wrap',
                              mt: 0.5,
                              maxHeight: 200,
                              overflow: 'auto',
                              fontSize: '0.8rem',
                              bgcolor: 'rgba(0,0,0,0.03)',
                              p: 1,
                              borderRadius: 1,
                            }}
                          >
                            {ing.body_text.slice(0, 1000)}
                            {ing.body_text.length > 1000 && '...'}
                          </Typography>
                        </Box>
                      )}

                      {/* Raw AI extraction JSON */}
                      {ing.ai_extraction && (
                        <Box sx={{ gridColumn: { md: 'span 2' } }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleJson(ing.id)}
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          >
                            {expandedJson.has(ing.id) ? 'Hide' : 'Show'} Raw AI Response
                            {expandedJson.has(ing.id) ? (
                              <ChevronUp style={{ height: 12, width: 12, marginLeft: 4 }} />
                            ) : (
                              <ChevronDown style={{ height: 12, width: 12, marginLeft: 4 }} />
                            )}
                          </Button>
                          {expandedJson.has(ing.id) && (
                            <Box
                              component="pre"
                              sx={{
                                mt: 1,
                                p: 1.5,
                                borderRadius: 1,
                                bgcolor: 'rgba(0,0,0,0.05)',
                                overflow: 'auto',
                                maxHeight: 400,
                                fontSize: '0.75rem',
                                lineHeight: 1.4,
                              }}
                            >
                              {JSON.stringify(ing.ai_extraction, null, 2)}
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  </CollapsibleContent>
                </CardContent>
              </Card>
            </Collapsible>
          ))}
        </Box>
      )}
    </Box>
  );
}
