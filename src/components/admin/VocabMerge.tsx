import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitMerge, Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  VOCABULARIES,
  useVocabTerms,
  useVocabRecentMerges,
  mergeVocabTerm,
  unmergeVocabTerm,
} from '@/hooks/useVocabDedup';

/**
 * Merge duplicate terms within the 8 settings vocabularies. These are small
 * curated lists disconnected from entity free-text (which the tag ontology owns),
 * so a merge de-duplicates the LIST: the dropped label becomes an alias on the
 * survivor and the row is deactivated. Reversible.
 */
export function VocabMerge() {
  const queryClient = useQueryClient();
  const [vocab, setVocab] = useState<string>(VOCABULARIES[0].key);
  const [keepId, setKeepId] = useState('');
  const [dropId, setDropId] = useState('');
  const { data: terms = [], isLoading } = useVocabTerms(vocab);
  const { data: recent = [] } = useVocabRecentMerges();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['vocab-terms', vocab] });
    queryClient.invalidateQueries({ queryKey: ['vocab-recent-merges'] });
  };

  const merge = useMutation({
    mutationFn: () => mergeVocabTerm(vocab, keepId, dropId),
    onSuccess: (auditId) => {
      const dropName = terms.find((t) => t.id === dropId)?.name;
      const keepName = terms.find((t) => t.id === keepId)?.name;
      setKeepId('');
      setDropId('');
      refresh();
      toast.success(`Merged “${dropName}” into “${keepName}”`, {
        action: auditId
          ? {
              label: 'Undo',
              onClick: async () => {
                await unmergeVocabTerm(auditId);
                refresh();
              },
            }
          : undefined,
      });
    },
    onError: (e) => toast.error(`Merge failed: ${(e as Error).message}`),
  });

  const unmerge = useMutation({
    mutationFn: (id: string) => unmergeVocabTerm(id),
    onSuccess: () => {
      toast.success('Restored');
      refresh();
    },
    onError: (e) => toast.error(`Undo failed: ${(e as Error).message}`),
  });

  const selectCls =
    'rounded-element border border-border bg-background px-2 py-1.5 text-15 min-w-0 flex-1';
  const canMerge = keepId && dropId && keepId !== dropId && !merge.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {VOCABULARIES.map((v) => (
          <Button
            key={v.key}
            variant={vocab === v.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setVocab(v.key);
              setKeepId('');
              setDropId('');
            }}
          >
            {v.label}
          </Button>
        ))}
      </div>

      <div className="rounded-container flex flex-col gap-4 border p-4">
        <p className="text-muted-foreground text-13">
          Pick a term to keep and a duplicate to merge into it. The dropped term’s label is kept as
          an alias on the survivor; entity data is unaffected.
        </p>
        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} /> Loading terms…
          </div>
        ) : terms.length < 2 ? (
          <div className="text-muted-foreground text-15">Not enough active terms to merge.</div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-2xs uppercase tracking-wide text-muted-foreground">Keep</span>
              <select className={selectCls} value={keepId} onChange={(e) => setKeepId(e.target.value)}>
                <option value="">Select survivor…</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.id === dropId}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                Merge (drop)
              </span>
              <select className={selectCls} value={dropId} onChange={(e) => setDropId(e.target.value)}>
                <option value="">Select duplicate…</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.id === keepId}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" onClick={() => merge.mutate()} disabled={!canMerge}>
              {merge.isPending ? <Loader2 className="animate-spin" size={16} /> : <GitMerge size={16} />}
              Merge
            </Button>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-15 font-semibold">Recently merged</h3>
          {recent.map((r) => (
            <div
              key={r.id}
              className="rounded-element flex items-center justify-between gap-4 border p-2"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline">{r.vocab}</Badge>
                <span className="text-15">{r.drop_name}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => unmerge.mutate(r.id)}
                disabled={unmerge.isPending}
              >
                <Undo2 size={16} /> Undo
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default VocabMerge;
