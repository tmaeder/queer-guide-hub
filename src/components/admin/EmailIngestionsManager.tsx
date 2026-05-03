import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { listFrom } from '@/hooks/usePageFetchers';
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
  ai_extraction: { events?: Array<{ title: string; city: string; country: string; start_date?: string; event_type?: string }>; venues?: Array<{ name: string; city: string; country: string; venue_type?: string; address?: string; category?: string }>; summary?: string };
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
      const data = await listFrom<EmailIngestion>(
        'email_ingestions',
        '*',
        { col: 'received_at', ascending: false },
        100,
      );
      setIngestions(data);
    } catch (_error) {
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

  const filtered = ingestions.filter((ing) => {
    if (statusFilter !== 'all' && ing.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return ing.subject.toLowerCase().includes(q) || ing.from_address.toLowerCase().includes(q);
    }
    return true;
  });

  const totalCount = ingestions.length;
  const completedCount = ingestions.filter((i) => i.status === 'completed').length;
  const failedCount = ingestions.filter((i) => i.status === 'failed').length;
  const processingCount = ingestions.filter((i) => i.status === 'processing').length;

  if (loading) {
    return (
      <div className="text-center p-8">
        <p className="text-sm text-muted-foreground">Loading email ingestions...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail style={{ height: 24, width: 24, color: '#ec4899' }} />
          <div>
            <h6 className="text-base font-semibold">Email Ingestions</h6>
            <p className="text-sm text-muted-foreground">Forwarded emails processed for LGBTQ+ events and venues</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchIngestions}>
          <RefreshCw style={{ height: 14, width: 14, marginRight: 6 }} />
          Refresh
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent style={{ padding: 16 }}>
            <div className="text-2xl font-bold">{totalCount}</div>
            <span className="text-xs text-muted-foreground">Total</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 16 }}>
            <div className="text-2xl font-bold" style={{ color: '#16a34a' }}>{completedCount}</div>
            <span className="text-xs text-muted-foreground">Completed</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 16 }}>
            <div className="text-2xl font-bold" style={{ color: '#dc2626' }}>{failedCount}</div>
            <span className="text-xs text-muted-foreground">Failed</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 16 }}>
            <div className="text-2xl font-bold" style={{ color: '#ca8a04' }}>{processingCount}</div>
            <span className="text-xs text-muted-foreground">Processing</span>
          </CardContent>
        </Card>
      </div>

      {/* Search and filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', height: 14, width: 14, color: '#9ca3af' }} />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by subject or sender..."
            style={{ paddingLeft: 32 }}
          />
        </div>
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
      </div>

      {/* Ingestion list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent style={{ padding: 32 }}>
            <div className="text-center text-muted-foreground">
              <Mail style={{ height: 40, width: 40, margin: '0 auto 12px', opacity: 0.4 }} />
              <p className="text-sm">
                {ingestions.length === 0
                  ? 'No email ingestions yet. Forward emails to ingest@queer.guide to get started.'
                  : 'No ingestions match your filters.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Badge variant={STATUS_BADGE_VARIANT[ing.status] || 'outline'}>
                        {ing.status === 'no_content' ? 'no content' : ing.status}
                      </Badge>
                      <span className="font-medium text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                        {ing.subject}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
                      <span className="hidden md:inline" title={ing.from_address}>
                        {ing.from_address.length > 24
                          ? ing.from_address.slice(0, 24) + '...'
                          : ing.from_address}
                      </span>

                      {ing.status === 'completed' && (
                        <div className="flex items-center gap-1">
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
                        </div>
                      )}

                      {ing.processing_ms != null && (
                        <span className="hidden sm:inline" title="Processing time">
                          <Clock style={{ height: 10, width: 10, display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />
                          {ing.processing_ms < 1000
                            ? `${ing.processing_ms}ms`
                            : `${(ing.processing_ms / 1000).toFixed(1)}s`}
                        </span>
                      )}

                      <span title={new Date(ing.received_at).toLocaleString()}>
                        {relativeTime(ing.received_at)}
                      </span>

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
                    </div>
                  </div>

                  {/* Expanded detail */}
                  <CollapsibleContent style={{ marginTop: 16 }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[0.85rem]">
                      <div>
                        <span className="font-medium">From:</span>
                        <p className="text-sm text-muted-foreground">{ing.from_address}</p>
                      </div>
                      <div>
                        <span className="font-medium">Received:</span>
                        <p className="text-sm text-muted-foreground">{new Date(ing.received_at).toLocaleString()}</p>
                      </div>
                      <div className="md:col-span-2">
                        <span className="font-medium">Subject:</span>
                        <p className="text-sm text-muted-foreground">{ing.subject}</p>
                      </div>

                      {ing.ai_extraction?.summary && (
                        <div className="md:col-span-2">
                          <span className="font-medium">AI Summary:</span>
                          <p className="text-sm text-muted-foreground">{ing.ai_extraction.summary}</p>
                        </div>
                      )}

                      {ing.error_message && (
                        <div className="md:col-span-2">
                          <div
                            className="flex items-start gap-2 p-3 rounded"
                            style={{
                              backgroundColor: 'rgba(220, 38, 38, 0.08)',
                              border: '1px solid rgba(220, 38, 38, 0.2)',
                            }}
                          >
                            <AlertCircle style={{ height: 14, width: 14, color: '#dc2626', marginTop: 2, flexShrink: 0 }} />
                            <p className="text-sm break-words" style={{ color: '#dc2626' }}>{ing.error_message}</p>
                          </div>
                        </div>
                      )}

                      {ing.ai_extraction?.events && ing.ai_extraction.events.length > 0 && (
                        <div className="md:col-span-2">
                          <span className="font-medium">Extracted Events ({ing.ai_extraction.events.length}):</span>
                          <div className="flex flex-col gap-1 mt-1">
                            {ing.ai_extraction.events.map((ev, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-[0.8rem] text-muted-foreground">
                                <Calendar style={{ height: 12, width: 12, flexShrink: 0 }} />
                                <span>
                                  <strong>{ev.title}</strong> — {ev.city}, {ev.country}
                                  {ev.start_date && ` (${new Date(ev.start_date).toLocaleDateString()})`}
                                </span>
                                <Badge variant="outline" style={{ fontSize: '0.65rem' }}>{ev.event_type}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {ing.ai_extraction?.venues && ing.ai_extraction.venues.length > 0 && (
                        <div className="md:col-span-2">
                          <span className="font-medium">Extracted Venues ({ing.ai_extraction.venues.length}):</span>
                          <div className="flex flex-col gap-1 mt-1">
                            {ing.ai_extraction.venues.map((v, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-[0.8rem] text-muted-foreground">
                                <Building style={{ height: 12, width: 12, flexShrink: 0 }} />
                                <span>
                                  <strong>{v.name}</strong> — {v.address}, {v.city}
                                </span>
                                <Badge variant="outline" style={{ fontSize: '0.65rem' }}>{v.category}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {ing.body_text && (
                        <div className="md:col-span-2">
                          <span className="font-medium">Body Preview:</span>
                          <p
                            className="text-sm text-muted-foreground mt-1 p-2 rounded overflow-auto whitespace-pre-wrap"
                            style={{ maxHeight: 200, fontSize: '0.8rem', backgroundColor: 'rgba(0,0,0,0.03)' }}
                          >
                            {ing.body_text.slice(0, 1000)}
                            {ing.body_text.length > 1000 && '...'}
                          </p>
                        </div>
                      )}

                      {ing.ai_extraction && (
                        <div className="md:col-span-2">
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
                            <pre
                              className="mt-2 p-3 rounded overflow-auto"
                              style={{
                                backgroundColor: 'rgba(0,0,0,0.05)',
                                maxHeight: 400,
                                fontSize: '0.75rem',
                                lineHeight: 1.4,
                              }}
                            >
                              {JSON.stringify(ing.ai_extraction, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </CardContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
