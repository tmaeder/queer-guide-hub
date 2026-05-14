/**
 * Entity Link Review Tab — surfaces pending rows from entity_link_review
 * (populated by news_commit_staging_batch from quality-enhance review queue).
 * Admins approve / reject candidate entity links per article.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { toast } from 'sonner';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = untypedSupabase as any;

type EntityType = 'country' | 'city' | 'region' | 'venue' | 'event' | 'personality' | 'organisation';

interface ReviewRow {
  id: string;
  article_id: string;
  entity_type: EntityType;
  candidate_id: string | null;
  candidate_name: string;
  score: number | null;
  context_snippet: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  // Joined article context
  news_articles?: { id: string; title: string; url: string | null } | null;
}

export default function EntityLinkReviewTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<EntityType | 'all'>('all');

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['entity-link-review', filter],
    queryFn: async () => {
      let query = sb
        .from('entity_link_review')
        .select('*, news_articles(id, title, url)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);
      if (filter !== 'all') query = query.eq('entity_type', filter);
      const { data, error: e } = await query;
      if (e) throw e;
      return (data ?? []) as unknown as ReviewRow[];
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      const { error: e } = await sb
        .from('entity_link_review')
        .update({ status, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (e) throw e;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.status === 'approved' ? 'Approved' : 'Rejected');
      qc.invalidateQueries({ queryKey: ['entity-link-review'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-7 w-7 animate-spin inline-block" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  const types: Array<EntityType | 'all'> = [
    'all', 'country', 'city', 'region', 'venue', 'event', 'personality', 'organisation',
  ];

  return (
    <div>
      <div className="flex flex-row gap-2 mb-6 flex-wrap">
        {types.map((t) => (
          <Badge
            key={t}
            variant={filter === t ? 'default' : 'outline'}
            onClick={() => setFilter(t)}
            className="capitalize cursor-pointer"
          >
            {t}
          </Badge>
        ))}
      </div>

      {(!rows || rows.length === 0) && (
        <Alert>
          <AlertDescription>No pending entity-link review items.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        {rows?.map((r) => (
          <div key={r.id} className="p-4 border border-border">
            <div className="flex flex-row justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-row gap-2 items-center mb-1">
                  <Badge variant="outline" className="text-xs">{r.entity_type}</Badge>
                  <p className="text-sm font-semibold">{r.candidate_name}</p>
                  {r.score != null && (
                    <Badge variant="outline" className="text-xs">
                      score {(r.score * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>
                {r.context_snippet && (
                  <span className="block text-xs text-muted-foreground mb-1">
                    {r.context_snippet}
                  </span>
                )}
                {r.news_articles && (
                  <span className="text-xs text-muted-foreground">
                    Article: {r.news_articles.title}
                  </span>
                )}
              </div>
              <div className="flex flex-row gap-2">
                <Button
                  size="sm"
                  onClick={() => resolve.mutate({ id: r.id, status: 'approved' })}
                  disabled={resolve.isPending}
                >
                  <CheckCircle2 size={14} className="mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolve.mutate({ id: r.id, status: 'rejected' })}
                  disabled={resolve.isPending}
                  className="text-destructive border-destructive"
                >
                  <XCircle size={14} className="mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
