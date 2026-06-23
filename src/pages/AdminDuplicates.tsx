import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, GitMerge, Image as ImageIcon, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useDuplicateClusters,
  useFuzzyDuplicateClusters,
  runFuzzyAutomerge,
  mergeEntityPair,
  unmergeEntity,
  FUZZY_CONTENT_TYPES,
  type Cluster,
  type ClusterMember,
  type VenueMeta,
  type FuzzyCluster,
  type DedupContentType,
} from '@/hooks/useVenueDuplicates';

/**
 * /admin/duplicates — duplicate review & merge across content types.
 *
 * Lists clusters from find_duplicate_clusters(<type>); the admin picks the
 * canonical row and merges the rest (soft + reversible — sets duplicate_of_id,
 * reparents children, records a slug redirect, audits the op). Venues use the
 * dedicated merge_venues RPC (+ a fuzzy same-place tab); events / marketplace /
 * personalities go through the generic merge_entities dispatcher. The success
 * toast offers an Undo.
 */

const CONTENT_TYPES: { value: DedupContentType; label: string }[] = [
  { value: 'venue', label: 'Venues' },
  { value: 'event', label: 'Events' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'personality', label: 'People' },
];

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
  const [contentType, setContentType] = useState<DedupContentType>('venue');
  const [view, setView] = useState<'exact' | 'fuzzy'>('exact');
  const { clusters, meta, isLoading, isError, error } = useDuplicateClusters(contentType);
  const [picked, setPicked] = useState<Record<string, string>>({});

  const keepFor = (c: Cluster) => picked[clusterKey(c)] ?? suggestKeep(c.members, meta);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['dup-clusters', contentType] });

  const mergeMutation = useMutation({
    mutationFn: async (c: Cluster): Promise<string[]> => {
      const keepId = keepFor(c);
      const audits: string[] = [];
      for (const m of c.members) {
        if (m.id === keepId) continue;
        const a = await mergeEntityPair(contentType, keepId, m.id);
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
              for (const id of audits) await unmergeEntity(contentType, id);
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

  // Fuzzy "same place / same item" review: venues, events, marketplace.
  const fuzzyAvailable = FUZZY_CONTENT_TYPES.includes(contentType);
  const effectiveView = fuzzyAvailable ? view : 'exact';

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-headline font-semibold">Duplicates</h1>
        <p className="text-muted-foreground text-15">
          Pick the canonical record and merge the rest — duplicates are hidden, their URLs redirect,
          and every merge is reversible.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {CONTENT_TYPES.map((t) => (
          <Button
            key={t.value}
            variant={contentType === t.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setContentType(t.value); setPicked({}); setView('exact'); }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {fuzzyAvailable && (
        <div className="flex gap-2">
          <Button variant={view === 'exact' ? 'default' : 'outline'} size="sm" onClick={() => setView('exact')}>
            Exact (name + city)
          </Button>
          <Button variant={view === 'fuzzy' ? 'default' : 'outline'} size="sm" onClick={() => setView('fuzzy')}>
            {contentType === 'marketplace' ? 'Same item (fuzzy)' : 'Same place (fuzzy)'}
          </Button>
        </div>
      )}

      {effectiveView === 'fuzzy' ? (
        <FuzzyDuplicates contentType={contentType} />
      ) : (
      <>
      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 p-4">
          <Loader2 className="animate-spin" size={16} /> Loading clusters…
        </div>
      )}
      {isError && <div className="text-destructive p-4">Failed to load clusters: {error?.message}</div>}
      {!isLoading && clusters.length === 0 && <div className="text-muted-foreground p-4">No duplicate clusters.</div>}

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
      </>
      )}
    </div>
  );
}

/** Fuzzy "same place / same item" view: key-corroborated pairs, with merge + undo. */
function FuzzyDuplicates({ contentType }: { contentType: DedupContentType }) {
  const queryClient = useQueryClient();
  const { clusters, isLoading, isError, error } = useFuzzyDuplicateClusters(contentType);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['fuzzy-dup-clusters', contentType] });
    queryClient.invalidateQueries({ queryKey: ['dup-clusters', contentType] });
  };

  // canonical = higher quality_score → featured → first listed
  const keepDrop = (c: FuzzyCluster): [string, string] => {
    const [a, b] = c.members;
    const aBetter =
      (a.quality_score ?? -1) > (b.quality_score ?? -1) ||
      ((a.quality_score ?? -1) === (b.quality_score ?? -1) && Boolean(a.is_featured) && !b.is_featured) ||
      ((a.quality_score ?? -1) === (b.quality_score ?? -1) && Boolean(a.is_featured) === Boolean(b.is_featured));
    return aBetter ? [a.id, b.id] : [b.id, a.id];
  };

  // Bulk auto-merge sweep is venue-only (run_venue_fuzzy_automerge); events &
  // marketplace are swept nightly server-side, so the UI offers per-pair merges.
  const autoMerge = useMutation({
    mutationFn: () => runFuzzyAutomerge(false),
    onSuccess: (r) => {
      toast.success(`Auto-merged ${r.merged} same-place pair${r.merged === 1 ? '' : 's'}` + (r.skipped ? ` (${r.skipped} skipped)` : ''));
      refresh();
    },
    onError: (e) => toast.error(`Auto-merge failed: ${(e as Error).message}`),
  });

  const mergeOne = useMutation({
    mutationFn: async (c: FuzzyCluster) => {
      const [keep, drop] = keepDrop(c);
      return mergeEntityPair(contentType, keep, drop);
    },
    onSuccess: (auditId) => {
      toast.success('Merged', {
        action: auditId
          ? { label: 'Undo', onClick: async () => { await unmergeEntity(contentType, auditId); refresh(); } }
          : undefined,
      });
      refresh();
    },
    onError: (e) => toast.error(`Merge failed: ${(e as Error).message}`),
  });

  const autoCount = clusters.filter((c) => c.auto_eligible).length;

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 p-4">
        <Loader2 className="animate-spin" size={16} /> Loading pairs…
      </div>
    );
  }
  if (isError) return <div className="text-destructive p-4">Failed to load pairs: {error?.message}</div>;
  if (clusters.length === 0) return <div className="text-muted-foreground p-4">No fuzzy duplicate pairs.</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-container flex items-center justify-between gap-4 border p-4">
        <p className="text-muted-foreground text-15">
          {clusters.length} candidate pairs · {autoCount} are key-identical and safe to merge automatically
          {contentType === 'venue' ? '.' : ' (swept nightly server-side).'}
        </p>
        {contentType === 'venue' && (
          <Button size="sm" onClick={() => autoMerge.mutate()} disabled={autoMerge.isPending || autoCount === 0}>
            {autoMerge.isPending ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
            Auto-merge {autoCount} same-place
          </Button>
        )}
      </div>

      {clusters.map((c) => {
        const [keepId] = keepDrop(c);
        const busy = mergeOne.isPending && mergeOne.variables === c;
        return (
          <div key={`${c.members[0].id}|${c.members[1].id}`} className="rounded-container flex flex-col gap-2 border p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={c.auto_eligible ? 'default' : 'secondary'}>
                  {c.auto_eligible ? 'auto-safe' : 'review'}
                </Badge>
                <Badge variant="outline">sim {c.score.toFixed(2)}</Badge>
                {c.dist_m != null && <Badge variant="outline">{c.dist_m} m apart</Badge>}
              </div>
              <Button size="sm" variant="outline" onClick={() => mergeOne.mutate(c)} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" size={16} /> : <GitMerge size={16} />}
                Merge
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              {c.members.map((m) => (
                <div key={m.id} className={`rounded-element flex items-center gap-2 p-2 ${m.id === keepId ? 'bg-accent' : ''}`}>
                  <span className="font-medium">{m.title}</span>
                  {m.id === keepId && <Badge variant="default">canonical</Badge>}
                  <code className="text-muted-foreground text-13">{m.slug}</code>
                  {m.city && <span className="text-muted-foreground text-13">{m.city}</span>}
                  {typeof m.quality_score === 'number' && <Badge variant="outline">q {Math.round(m.quality_score)}</Badge>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
