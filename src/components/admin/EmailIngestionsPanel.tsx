/**
 * EmailIngestionsPanel — Admin view for email ingestion pipeline results.
 *
 * Shows email_ingestions table with status, extracted counts, processing time.
 * Expandable rows show AI extraction results and links to created entities.
 */

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Mail, Calendar, MapPin, AlertCircle, Clock } from 'lucide-react';
import { Link } from 'react-router';
import { listFromWhere } from '@/hooks/usePageFetchers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface EmailIngestion {
  id: string;
  from_address: string;
  to_address: string;
  subject: string;
  status: string;
  extracted_events: number;
  extracted_venues: number;
  inserted_event_ids: string[];
  inserted_venue_ids: string[];
  ai_extraction: Record<string, unknown> | null;
  processing_ms: number | null;
  error_message: string | null;
  received_at: string;
  created_at: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  processing: 'secondary',
  failed: 'destructive',
  no_content: 'outline',
};

export const EmailIngestionsPanel: React.FC = () => {
  const [ingestions, setIngestions] = useState<EmailIngestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchIngestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const fetchIngestions = async () => {
    setLoading(true);
    const filters: Array<{ col: string; val: unknown }> = [];
    if (statusFilter !== 'all') filters.push({ col: 'status', val: statusFilter });
    const data = await listFromWhere<EmailIngestion>('email_ingestions', '*', filters, {
      order: { col: 'received_at', ascending: false },
      limit: 50,
    });
    setIngestions(data);
    setLoading(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) {
    return (
      <div className="p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 mb-2 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mail size={20} />
          <h6 className="text-lg font-medium">Email Ingestions</h6>
          <Badge variant="secondary">{ingestions.length}</Badge>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-w-[140px] h-9 w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="no_content">No Content</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {ingestions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Mail size={32} style={{ opacity: 0.3, marginBottom: 8 }} className="mx-auto" />
          <p>No email ingestions found</p>
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>From</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Events</TableHead>
                <TableHead className="text-center">Venues</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ingestions.map((ing) => (
                <React.Fragment key={ing.id}>
                  <TableRow
                    onClick={() => toggleExpand(ing.id)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        {expandedId === ing.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{ing.from_address}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm truncate block max-w-[250px]">
                        {ing.subject || '(no subject)'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[ing.status] || 'outline'}>
                        {ing.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {ing.extracted_events > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <Calendar size={12} />{ing.extracted_events}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {ing.extracted_venues > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <MapPin size={12} />{ing.extracted_venues}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {new Date(ing.received_at).toLocaleString()}
                      </span>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <Collapsible open={expandedId === ing.id}>
                        <CollapsibleContent>
                          <div className="p-4 bg-muted">
                            <div className="flex gap-4 mb-4 flex-wrap">
                              {ing.processing_ms != null && (
                                <Badge variant="secondary" className="gap-1">
                                  <Clock size={12} />{ing.processing_ms}ms
                                </Badge>
                              )}
                              {ing.error_message && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertCircle size={12} />{ing.error_message}
                                </Badge>
                              )}
                            </div>

                            {ing.inserted_event_ids?.length > 0 && (
                              <div className="mb-2">
                                <span className="text-xs font-semibold">Created Events:</span>
                                <div className="flex gap-1 flex-wrap mt-1">
                                  {ing.inserted_event_ids.map((id) => (
                                    <Link key={id} to={`/events/${id}`}>
                                      <Badge variant="outline" className="cursor-pointer">{id.slice(0, 8)}</Badge>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}
                            {ing.inserted_venue_ids?.length > 0 && (
                              <div className="mb-2">
                                <span className="text-xs font-semibold">Created Venues:</span>
                                <div className="flex gap-1 flex-wrap mt-1">
                                  {ing.inserted_venue_ids.map((id) => (
                                    <Link key={id} to={`/venues/${id}`}>
                                      <Badge variant="outline" className="cursor-pointer">{id.slice(0, 8)}</Badge>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}

                            {ing.ai_extraction && (
                              <div className="mt-2">
                                <span className="text-xs font-semibold">AI Extraction:</span>
                                <pre className="mt-1 p-2 bg-card rounded text-[0.7rem] overflow-auto max-h-[200px] border">
                                  {JSON.stringify(ing.ai_extraction, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default EmailIngestionsPanel;
