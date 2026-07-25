import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { untypedFrom } from '@/integrations/supabase/untyped';

interface SectionRow {
  id: string;
  position: number;
  kind: 'prose' | 'callout' | 'comparison';
  body_md: string | null;
}

/** Relation editor for guide_sections — prose/callout blocks interleaved with picks. */
export function GuideSectionsPanel({ guideId }: { guideId: string }) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['admin-guide-sections', guideId] });

  const { data: sections } = useQuery({
    queryKey: ['admin-guide-sections', guideId],
    queryFn: async (): Promise<SectionRow[]> => {
      const { data, error } = await untypedFrom('guide_sections')
        .select('id, position, kind, body_md')
        .eq('guide_id', guideId)
        .order('position');
      if (error) throw error;
      return (data ?? []) as SectionRow[];
    },
  });

  const addSection = useMutation({
    mutationFn: async () => {
      const { error } = await untypedFrom('guide_sections').insert({
        guide_id: guideId,
        kind: 'prose',
        position: sections?.length ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) =>
      toast({ title: 'Add section failed', description: e.message, variant: 'destructive' }),
  });

  const updateSection = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<SectionRow> & { id: string }) => {
      const { error } = await untypedFrom('guide_sections').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const removeSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('guide_sections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) =>
      toast({ title: 'Remove failed', description: e.message, variant: 'destructive' }),
  });

  const move = (idx: number, dir: -1 | 1) => {
    if (!sections) return;
    const other = idx + dir;
    if (other < 0 || other >= sections.length) return;
    updateSection.mutate({ id: sections[idx].id, position: sections[other].position });
    updateSection.mutate({ id: sections[other].id, position: sections[idx].position });
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {(sections ?? []).map((s, idx) => (
          <li key={s.id} className="rounded-element border border-border p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Select
                value={s.kind}
                onValueChange={(v) =>
                  updateSection.mutate({ id: s.id, kind: v as SectionRow['kind'] })
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prose">Prose</SelectItem>
                  <SelectItem value="callout">Callout</SelectItem>
                  <SelectItem value="comparison">Comparison</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => move(idx, -1)} aria-label="Move up">
                <ArrowUp size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => move(idx, 1)} aria-label="Move down">
                <ArrowDown size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSection.mutate(s.id)}
                aria-label="Remove section"
              >
                <Trash2 size={14} />
              </Button>
            </div>
            <Textarea
              defaultValue={s.body_md ?? ''}
              placeholder="Section body (markdown paragraphs)"
              rows={4}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (s.body_md ?? '')) updateSection.mutate({ id: s.id, body_md: v || null });
              }}
            />
          </li>
        ))}
        {!sections?.length && (
          <li className="text-sm italic text-muted-foreground">No sections yet.</li>
        )}
      </ul>
      <Button variant="outline" size="sm" onClick={() => addSection.mutate()}>
        <Plus size={14} className="mr-2" aria-hidden />
        Add section
      </Button>
    </div>
  );
}
