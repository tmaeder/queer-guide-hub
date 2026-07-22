import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { untypedRpc } from '@/integrations/supabase/untyped';

interface Proposal {
  id: string;
  milestone_title: string;
  milestone_slug: string;
  personality_name: string | null;
  personality_slug: string | null;
  matched_name: string | null;
  matched_field: 'title' | 'description' | null;
  confidence: 'high' | 'medium' | 'low';
  created_at: string;
}

/**
 * Review queue for name-matched milestone→personality links the backfill was not
 * confident enough to auto-insert (description-only matches, mononyms, ambiguous
 * common names). Approving commits the link into milestone_links; rejecting
 * closes it. Backfill script:
 * scripts/data-quality/backfill-milestone-personality-links.ts
 */
export function MilestoneLinkProposalsPanel() {
  const qc = useQueryClient();

  const { data: proposals, isLoading } = useQuery({
    queryKey: ['milestone-link-proposals', 'pending'],
    queryFn: async (): Promise<Proposal[]> => {
      const { data, error } = await untypedRpc<Proposal[]>('list_milestone_link_proposals', {
        p_status: 'pending',
        p_limit: 300,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await untypedRpc(
        approve ? 'approve_milestone_link_proposal' : 'reject_milestone_link_proposal',
        approve ? { p_id: id, p_role: null } : { p_id: id },
      );
      if (error) throw error;
    },
    onSuccess: (_d, { approve }) => {
      qc.invalidateQueries({ queryKey: ['milestone-link-proposals', 'pending'] });
      toast({ title: approve ? 'Link approved' : 'Proposal rejected' });
    },
    onError: (e: Error) =>
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' }),
  });

  if (isLoading || !proposals?.length) return null;

  return (
    <div className="mx-4 mt-4 rounded-container border border-border p-4">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-15 font-semibold">Link proposals</h2>
        <Badge variant="outline">{proposals.length} pending</Badge>
        <span className="text-13 text-muted-foreground">
          Name-matched personalities awaiting review before they join a milestone.
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {proposals.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {p.personality_name ?? p.matched_name ?? p.id}
                <Badge
                  variant={p.confidence === 'low' ? 'secondary' : 'outline'}
                  className="ml-2 align-middle"
                >
                  {p.confidence} · {p.matched_field}
                </Badge>
              </p>
              <p className="truncate text-13 text-muted-foreground">
                in{' '}
                <a
                  href={`/history/${p.milestone_slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {p.milestone_title}
                </a>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: p.id, approve: true })}
              aria-label={`Approve link to ${p.personality_name ?? p.matched_name}`}
            >
              <Check size={14} className="mr-1" aria-hidden />
              Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: p.id, approve: false })}
              aria-label={`Reject link to ${p.personality_name ?? p.matched_name}`}
            >
              <X size={14} aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
