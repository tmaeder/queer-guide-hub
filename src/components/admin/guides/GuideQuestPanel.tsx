import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';
import { questPhase, type Guide, type QuestCriteria } from '@/hooks/useGuides';

/**
 * Quest companion panel: criteria editing, participation stats, recap
 * generation. Lifecycle (scheduled → live → completed) is derived from the
 * publish window — editors steer it by setting starts_at/ends_at in the
 * Details group, not by flipping a status.
 */
export function GuideQuestPanel({ guideId }: { guideId: string }) {
  const qc = useQueryClient();
  const [creatingRecap, setCreatingRecap] = useState(false);

  const { data: guide } = useQuery({
    queryKey: ['admin-guide-quest', guideId],
    queryFn: async (): Promise<Guide | null> => {
      const { data, error } = await untypedFrom('guides')
        .select('*')
        .eq('id', guideId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Guide | null;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-guide-quest-stats', guideId],
    enabled: guide?.format === 'quest',
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('quest_progress', {
        p_quest_id: guideId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as {
        accepted_count: number;
        pending_count: number;
        contributor_count: number;
        target_count: number;
      } | null;
    },
  });

  if (!guide) return null;
  if (guide.format !== 'quest') {
    return (
      <p className="text-sm italic text-muted-foreground">
        Quest tools appear when the format is set to Quest.
      </p>
    );
  }

  const phase = questPhase(guide);
  const criteria: QuestCriteria = guide.criteria ?? {};

  const saveCriteria = async (patch: Partial<QuestCriteria>) => {
    const { error } = await untypedFrom('guides')
      .update({ criteria: { ...criteria, ...patch } })
      .eq('id', guideId);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      qc.invalidateQueries({ queryKey: ['admin-guide-quest', guideId] });
    }
  };

  const createRecap = async () => {
    setCreatingRecap(true);
    try {
      const { data, error } = await untypedSupabase.rpc('quest_create_recap_stub', {
        p_quest_id: guideId,
      });
      if (error) throw error;
      toast({ title: 'Recap stub created', description: `Draft news article ${data as string}` });
      qc.invalidateQueries({ queryKey: ['admin-guide-quest', guideId] });
    } catch (e) {
      toast({ title: 'Recap failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setCreatingRecap(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Badge variant={phase === 'active' ? 'default' : 'outline'}>
          {phase ? phase : 'not published'}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Lifecycle derives from the publish window (Details → Window start / end).
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="quest-entity-type" className="text-xs text-muted-foreground">
            Submission entity type
          </Label>
          <Input
            id="quest-entity-type"
            defaultValue={criteria.entity_type ?? ''}
            placeholder="venue | event | personality | news | place"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (criteria.entity_type ?? '')) {
                void saveCriteria({ entity_type: v || undefined });
              }
            }}
          />
        </div>
        <div>
          <Label htmlFor="quest-target" className="text-xs text-muted-foreground">
            Target contributions
          </Label>
          <Input
            id="quest-target"
            type="number"
            defaultValue={criteria.target_count ?? ''}
            onBlur={(e) => {
              const v = e.target.value ? Number(e.target.value) : undefined;
              if (v !== criteria.target_count) void saveCriteria({ target_count: v });
            }}
          />
        </div>
        <div>
          <Label htmlFor="quest-region" className="text-xs text-muted-foreground">
            Region (optional)
          </Label>
          <Input
            id="quest-region"
            defaultValue={criteria.region ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (criteria.region ?? '')) void saveCriteria({ region: v || undefined });
            }}
          />
        </div>
        <div>
          <Label htmlFor="quest-notes" className="text-xs text-muted-foreground">
            Notes (optional)
          </Label>
          <Input
            id="quest-notes"
            defaultValue={criteria.notes ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (criteria.notes ?? '')) void saveCriteria({ notes: v || undefined });
            }}
          />
        </div>
      </div>

      <div className="rounded-element border border-border p-4 text-sm">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Participation</p>
        <p>
          {stats?.accepted_count ?? 0} accepted · {stats?.pending_count ?? 0} pending ·{' '}
          {stats?.contributor_count ?? 0} contributors
          {stats?.target_count ? ` · target ${stats.target_count}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={createRecap}
          disabled={creatingRecap || !!guide.recap_article_id}
        >
          <Newspaper size={14} className="mr-2" aria-hidden />
          {guide.recap_article_id
            ? 'Recap already created'
            : creatingRecap
              ? 'Creating…'
              : 'Create recap article stub'}
        </Button>
        {guide.recap_article_id && (
          <span className="text-xs text-muted-foreground">
            Recap article: {guide.recap_article_id}
          </span>
        )}
      </div>
    </div>
  );
}
