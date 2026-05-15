/**
 * ModerationQueue — community-submitted content awaiting moderation.
 * Pulls from `community_submissions` (status='pending' / feedback_status='new')
 * and surfaces approve / reject / spam actions. Reuses CommentThread for context.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ThumbsUp, ThumbsDown, Flag, ShieldAlert, Inbox, MessageSquare, X } from 'lucide-react';
import { listFromWhere, updateRow } from '@/hooks/usePageFetchers';
import { CommentThread } from './CommentThread';

interface ModerationItem {
  id: string;
  content_type: string;
  status: string;
  feedback_status: string;
  is_spam: boolean;
  priority: number;
  data: Record<string, unknown> | null;
  submitted_at: string;
  submitted_by: string | null;
  ip_address: string | null;
}

type FilterKind = 'pending' | 'spam' | 'all';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function previewTitle(item: ModerationItem): string {
  const data = item.data ?? {};
  const candidate =
    (data.title as string) ||
    (data.name as string) ||
    (data.subject as string) ||
    (data.content as string) ||
    (data.message as string) ||
    '(Untitled submission)';
  return String(candidate).slice(0, 120);
}

export function ModerationQueue() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKind>('pending');
  const [actionId, setActionId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const filters: Array<{ col: string; val: unknown; op?: 'eq' | 'in' }> = [];
    if (filter === 'pending') {
      filters.push({ col: 'feedback_status', val: ['new', 'under_review'], op: 'in' });
      filters.push({ col: 'is_spam', val: false });
    } else if (filter === 'spam') {
      filters.push({ col: 'is_spam', val: true });
    }
    try {
      const data = await listFromWhere<ModerationItem>(
        'community_submissions',
        'id, content_type, status, feedback_status, is_spam, priority, data, submitted_at, submitted_by, ip_address',
        filters,
        { order: { col: 'submitted_at', ascending: false }, limit: 100 },
      );
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    return {
      pending: items.filter((i) => !i.is_spam && ['new', 'under_review'].includes(i.feedback_status))
        .length,
      spam: items.filter((i) => i.is_spam).length,
      total: items.length,
    };
  }, [items]);

  const transition = useCallback(
    async (
      id: string,
      patch: Partial<Pick<ModerationItem, 'feedback_status' | 'is_spam' | 'status'>>,
    ) => {
      setActionId(id);
      const { error: err } = await updateRow('community_submissions', id, {
        ...patch,
        reviewed_at: new Date().toISOString(),
      });
      setActionId(null);
      if (err) {
        setError((err as { message: string }).message);
      } else {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    },
    [],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold mb-1">Moderation Queue</h2>
          <p className="text-sm text-muted-foreground">
            {counts.pending} pending · {counts.spam} flagged as spam
          </p>
        </div>
        <div className="min-w-40">
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterKind)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="spam">Spam</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 relative">
          <AlertDescription>{error}</AlertDescription>
          <Button
            variant="ghost"
            onClick={() => setError(null)}
            className="absolute right-2 top-2 h-6 w-6 p-0"
            aria-label="Dismiss"
          >
            <X size={14} />
          </Button>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin" size={32} aria-label="Loading" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <Inbox size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p className="text-sm">Nothing to moderate.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const busy = actionId === item.id;
            const expanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className={`border rounded-element bg-background overflow-hidden ${
                  item.is_spam ? 'border-destructive/50' : 'border-border'
                }`}
              >
                <div
                  className="p-4 cursor-pointer hover:bg-muted"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="h-[22px] text-[0.7rem] font-semibold">
                      {item.content_type}
                    </Badge>
                    {item.is_spam && (
                      <Badge variant="destructive" className="h-[22px] text-[0.7rem] gap-1">
                        <Flag size={12} />
                        Spam
                      </Badge>
                    )}
                    {item.priority > 0 && (
                      <Badge className="h-[22px] text-[0.7rem] gap-1 bg-yellow-500 text-white hover:bg-yellow-600">
                        <ShieldAlert size={12} />
                        Priority {item.priority}
                      </Badge>
                    )}
                    <div className="flex-1" />
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(item.submitted_at)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold mb-1">{previewTitle(item)}</p>
                  {item.submitted_by && (
                    <span className="text-xs text-muted-foreground">
                      by {item.submitted_by.slice(0, 8)}…
                    </span>
                  )}
                </div>

                <div
                  className="px-4 py-2 border-t border-border flex gap-2 flex-wrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => transition(item.id, { feedback_status: 'approved', status: 'approved' })}
                    className="font-semibold text-xs bg-green-600 hover:bg-green-700 text-white"
                  >
                    <ThumbsUp size={14} />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => transition(item.id, { feedback_status: 'rejected', status: 'rejected' })}
                    className="font-semibold text-xs text-destructive border-destructive/50 hover:bg-destructive/10"
                  >
                    <ThumbsDown size={14} />
                    Reject
                  </Button>
                  {!item.is_spam && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => transition(item.id, { is_spam: true })}
                      className="font-medium text-xs text-yellow-600 hover:text-yellow-700"
                    >
                      <Flag size={14} />
                      Mark spam
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="font-medium text-xs text-muted-foreground"
                  >
                    <MessageSquare size={14} />
                    {expanded ? 'Hide' : 'Discuss'}
                  </Button>
                </div>

                {expanded && (
                  <div className="border-t border-border p-4 bg-muted/40">
                    <span className="text-xs text-muted-foreground block mb-2">
                      Submission data
                    </span>
                    <pre className="m-0 p-3 bg-background border border-border rounded text-xs overflow-auto max-h-52">
                      {JSON.stringify(item.data, null, 2)}
                    </pre>
                    <div className="mt-4">
                      <CommentThread sourceTable="community_submissions" sourceId={item.id} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
