import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, GitMerge, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  useDuplicateClusters,
  mergeVenuePair,
  unmergeAudit,
  type Cluster,
  type ClusterMember,
  type VenueMeta,
} from '@/hooks/useVenueDuplicates';

/**
 * /admin/duplicates — duplicate-venue review & merge (dedup Phase 1).
 *
 * Lists clusters from find_duplicate_clusters('venue'); the admin picks the
 * canonical row and merges the rest (soft + reversible — sets duplicate_of_id,
 * reparents children, records a slug redirect, audits the op). The success toast
 * offers an Undo that calls unmerge_venues.
 */

const clusterKey = (c: Cluster) => `${c.normalized_title}|${c.city ?? ''}`;
const hasImage = (m?: VenueMeta) => Array.isArray(m?.images) && (m!.images as unknown[]).length > 0;

/** Suggest the canonical: highest quality_score, then featured, then oldest. */
function suggestKeep(members: ClusterMember[], meta: Map<string, VenueMeta>): string {
  return [...members].sort((a, b) => {
    const ma = meta.get(a.id);
    const mb = meta.get(b.id);
    const q = (mb?.quality_score ?? -1) - (ma?.quality_score ?? -1);
    if (q !== 0) return q;
    const f = Number(mb?.is_featured ?? false) - Number(ma?.is_featured ?? false);
    if (f !== 0) return f;
    return (ma?.created_at ?? '').localeCompare(mb?.created_at ?? '');
  })[0].id;
}

export default function AdminDuplicates() {
  const queryClient = useQueryClient();
  const { clusters, meta, isLoading, isError, error } = useDuplicateClusters();
  const [picked, setPicked] = useState<Record<string, string>>({});

  const keepFor = (c: Cluster) => picked[clusterKey(c)] ?? suggestKeep(c.members, meta);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['dup-clusters', 'venue'] });

  const mergeMutation = useMutation({
    mutationFn: async (c: Cluster): Promise<string[]> => {
      const keepId = keepFor(c);
      const audits: string[] = [];
      for (const m of c.members) {
        if (m.id === keepId) continue;
        const a = await mergeVenuePair(keepId, m.id);
        if (a) audits.push(a);
      }
      return audits;
    },
    onSuccess: (audits, c) => {
      refresh();
      const keepTitle = c.members.find((m) => m.id === keepFor(c))?.title;
      toast.success(`Merged ${audits.length} duplicate${audits.length === 1 ? '' : 's'} into "${keepTitle}"`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              for (const id of audits) await unmergeAudit(id);
              toast.success('Merge undone');
              refresh();
            } catch (e) {
              toast.error(`Undo failed: ${(e as Error).message}`);
            }
          },
        },
      });
    },
    onError: (e) => toast.error(`Merge failed: ${(e as Error).message}`),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-headline font-semibold">Duplicate venues</h1>
        <p className="text-muted-foreground text-15">
          Near-identical venues grouped by name + city. Pick the canonical record and merge the rest —
          duplicates are hidden, their URLs redirect, and the merge is reversible.
        </p>
      </header>

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 p-4">
          <Loader2 className="animate-spin" size={16} /> Loading clusters…
        </div>
      )}
      {isError && <div className="text-destructive p-4">Failed to load clusters: {error?.message}</div>}
      {!isLoading && clusters.length === 0 && <div className="text-muted-foreground p-4">No duplicate venue clusters.</div>}

      <div className="flex flex-col gap-4">
        {clusters.map((c) => {
          const key = clusterKey(c);
          const keepId = keepFor(c);
          const busy = mergeMutation.isPending && mergeMutation.variables === c;
          return (
            <div key={key} className="rounded-container flex flex-col gap-4 border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.members[0]?.title ?? c.normalized_title}</span>
                  {c.city && <Badge variant="outline">{c.city}</Badge>}
                  <Badge variant="secondary">{c.count} copies</Badge>
                </div>
                <Button size="sm" onClick={() => mergeMutation.mutate(c)} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <GitMerge size={16} />}
                  Merge {c.count - 1} into selected
                </Button>
              </div>

              <div className="flex flex-col gap-1">
                {c.members.map((m) => {
                  const vm = meta.get(m.id);
                  const isKeep = m.id === keepId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPicked((p) => ({ ...p, [key]: m.id }))}
                      className={`rounded-element flex items-center gap-2 p-2 text-left ${isKeep ? 'bg-accent' : 'hover:bg-muted'}`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${isKeep ? 'bg-foreground' : ''}`}>
                        {isKeep && <Check size={12} className="text-background" />}
                      </span>
                      <span className="font-medium">{m.title}</span>
                      {isKeep && <Badge variant="default">canonical</Badge>}
                      <code className="text-muted-foreground text-13">{m.slug}</code>
                      {typeof vm?.quality_score === 'number' && <Badge variant="outline">q {Math.round(vm.quality_score)}</Badge>}
                      {hasImage(vm) && <ImageIcon size={14} className="text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
