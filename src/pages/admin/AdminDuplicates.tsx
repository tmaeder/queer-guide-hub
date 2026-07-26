import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, GitMerge, Image as ImageIcon, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useDedupTypes,
  useDuplicateClusters,
  useFuzzyDuplicateClusters,
  runFuzzyAutomerge,
  mergeEntityPair,
  unmergeEntity,
  type Cluster,
  type ClusterMember,
  type VenueMeta,
  type FuzzyCluster,
  type DedupType,
} from '@/hooks/useVenueDuplicates';
import { TagMergeReviewQueue } from '@/components/admin/TagMergeReviewQueue';
import { VocabMerge } from '@/components/admin/VocabMerge';

/**
 * /admin/duplicates — the registry-driven duplicate review & merge console,
 * covering every content type and every taxonomy.
 *
 * Content types: the selector is built from the content-type registry (any type
 * with an `admin.dedup` block). Clusters come from find_duplicate_clusters(<type>)
 * (or a per-type finder); the admin picks the canonical row and merges the rest
 * (soft + reversible — sets duplicate_of_id, reparents children, records a slug
 * redirect, audits, offers Undo). Merge routing is per-type (venue/city dedicated
 * RPCs, everything else via the merge_entities dispatcher).
 *
 * Taxonomies: unified_tags uses its own propose/approve cockpit (TagMergeReviewQueue).
 */

type Family = 'content' | 'taxonomy';
type DupView = 'exact' | 'fuzzy';

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
  const [family, setFamily] = useState<Family>('content');
  const types = useDedupTypes();
  // Deep links: ?type=<registry key or merge type>&view=exact|fuzzy
  // (?view=suggested is legacy — the nightly-sweep queue moved to the inbox).
  const [searchParams] = useSearchParams();
  const paramType = searchParams.get('type');
  const paramView = searchParams.get('view');
  const initialKey = types.find((t) => t.key === paramType || t.cfg.searchType === paramType)?.key;
  const initialView: DupView = paramView === 'fuzzy' ? 'fuzzy' : 'exact';
  const [typeKey, setTypeKey] = useState<string>(initialKey ?? types[0]?.key ?? 'venues');
  const selected = useMemo(
    () => types.find((t) => t.key === typeKey) ?? types[0],
    [types, typeKey],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-headline font-semibold">Duplicates &amp; merge</h1>
        <p className="text-muted-foreground text-15">
          Pick the canonical record and merge the rest — duplicates are hidden, their URLs
          redirect, and every merge is reversible.
        </p>
      </header>

      <div className="rounded-container flex flex-wrap items-center gap-2 border p-4 text-15">
        <GitMerge size={16} className="text-muted-foreground" />
        <span>
          Suggested pairs from the nightly sweep are reviewed in the{' '}
          <Link to="/admin/inbox?queue=dedup-review" className="font-medium underline">
            inbox dedup queue
          </Link>
          . This page is the exact/fuzzy merge power tool.
        </span>
      </div>

      <div className="flex gap-2 border-b border-border pb-2" role="tablist">
        <Button
          variant={family === 'content' ? 'default' : 'ghost'}
          size="sm"
          role="tab"
          aria-selected={family === 'content'}
          onClick={() => setFamily('content')}
        >
          Content types
        </Button>
        <Button
          variant={family === 'taxonomy' ? 'default' : 'ghost'}
          size="sm"
          role="tab"
          aria-selected={family === 'taxonomy'}
          onClick={() => setFamily('taxonomy')}
        >
          Taxonomies
        </Button>
      </div>

      {family === 'taxonomy' ? (
        <TaxonomyDuplicates />
      ) : selected ? (
        <ContentDuplicates
          type={selected}
          types={types}
          onSelect={setTypeKey}
          initialView={initialView}
        />
      ) : (
        <div className="text-muted-foreground p-4">No dedup-enabled content types.</div>
      )}
    </div>
  );
}

/** Registry-driven content-type dedup: type selector + exact/fuzzy views. */
function ContentDuplicates({
  type,
  types,
  onSelect,
  initialView = 'exact',
}: {
  type: DedupType;
  types: DedupType[];
  onSelect: (key: string) => void;
  initialView?: DupView;
}) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<DupView>(initialView);
  const { clusters, meta, isLoading, isError, error } = useDuplicateClusters(type.key);
  const [picked, setPicked] = useState<Record<string, string>>({});

  const keepFor = (c: Cluster) => picked[clusterKey(c)] ?? suggestKeep(c.members, meta);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['dup-clusters', type.key] });

  const mergeMutation = useMutation({
    mutationFn: async (c: Cluster): Promise<string[]> => {
      const keepId = keepFor(c);
      const audits: string[] = [];
      for (const m of c.members) {
        if (m.id === keepId) continue;
        const a = await mergeEntityPair(type.key, keepId, m.id);
        if (a) audits.push(a);
      }
      return audits;
    },
    onSuccess: (audits, c) => {
      refresh();
      const keepTitle = c.members.find((m) => m.id === keepFor(c))?.title;
      toast.success(
        `Merged ${audits.length} duplicate${audits.length === 1 ? '' : 's'} into "${keepTitle}"`,
        {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                for (const id of audits) await unmergeEntity(type.key, id);
                toast.success('Merge undone');
                refresh();
              } catch (e) {
                toast.error(`Undo failed: ${(e as Error).message}`);
              }
            },
          },
        },
      );
    },
    onError: (e) => toast.error(`Merge failed: ${(e as Error).message}`),
  });

  const fuzzyAvailable = Boolean(type.cfg.fuzzyRpc);
  const effectiveView: DupView = view === 'fuzzy' && !fuzzyAvailable ? 'exact' : view;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <Button
            key={t.key}
            variant={type.key === t.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              onSelect(t.key);
              setPicked({});
              setView('exact');
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          variant={effectiveView === 'exact' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('exact')}
        >
          Exact (name + city)
        </Button>
        {fuzzyAvailable && (
          <Button
            variant={effectiveView === 'fuzzy' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('fuzzy')}
          >
            {type.cfg.searchType === 'marketplace' ? 'Same item (fuzzy)' : 'Same place (fuzzy)'}
          </Button>
        )}
      </div>

      {effectiveView === 'fuzzy' ? (
        <FuzzyDuplicates type={type} />
      ) : (
        <>
          {isLoading && (
            <div className="text-muted-foreground flex items-center gap-2 p-4">
              <Loader2 className="animate-spin" size={16} /> Loading clusters…
            </div>
          )}
          {isError && (
            <div className="text-destructive p-4">Failed to load clusters: {error?.message}</div>
          )}
          {!isLoading && clusters.length === 0 && (
            <div className="text-muted-foreground p-4">No duplicate clusters.</div>
          )}

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
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-full border ${isKeep ? 'bg-foreground' : ''}`}
                          >
                            {isKeep && <Check size={12} className="text-background" />}
                          </span>
                          <span className="font-medium">{m.title}</span>
                          {isKeep && <Badge variant="default">canonical</Badge>}
                          <code className="text-muted-foreground text-13">{m.slug}</code>
                          {typeof vm?.quality_score === 'number' && (
                            <Badge variant="outline">q {Math.round(vm.quality_score)}</Badge>
                          )}
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
function FuzzyDuplicates({ type }: { type: DedupType }) {
  const queryClient = useQueryClient();
  const { clusters, isLoading, isError, error } = useFuzzyDuplicateClusters(type.key);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['fuzzy-dup-clusters', type.key] });
    queryClient.invalidateQueries({ queryKey: ['dup-clusters', type.key] });
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

  // Bulk auto-merge sweep is available for types that declare an autoMergeRpc
  // (venues today); events & marketplace are swept nightly server-side.
  const autoMergeRpc = type.cfg.autoMergeRpc;
  const autoMerge = useMutation({
    mutationFn: () => runFuzzyAutomerge(autoMergeRpc!, false),
    onSuccess: (r) => {
      toast.success(
        `Auto-merged ${r.merged} same-place pair${r.merged === 1 ? '' : 's'}` +
          (r.skipped ? ` (${r.skipped} skipped)` : ''),
      );
      refresh();
    },
    onError: (e) => toast.error(`Auto-merge failed: ${(e as Error).message}`),
  });

  const mergeOne = useMutation({
    mutationFn: async (c: FuzzyCluster) => {
      const [keep, drop] = keepDrop(c);
      return mergeEntityPair(type.key, keep, drop);
    },
    onSuccess: (auditId) => {
      toast.success('Merged', {
        action: auditId
          ? {
              label: 'Undo',
              onClick: async () => {
                await unmergeEntity(type.key, auditId);
                refresh();
              },
            }
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
          {clusters.length} candidate pairs · {autoCount} are key-identical and safe to merge
          automatically
          {autoMergeRpc ? '.' : ' (swept nightly server-side).'}
        </p>
        {autoMergeRpc && (
          <Button
            size="sm"
            onClick={() => autoMerge.mutate()}
            disabled={autoMerge.isPending || autoCount === 0}
          >
            {autoMerge.isPending ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
            Auto-merge {autoCount} same-place
          </Button>
        )}
      </div>

      {clusters.map((c) => {
        const [keepId] = keepDrop(c);
        const busy = mergeOne.isPending && mergeOne.variables === c;
        return (
          <div
            key={`${c.members[0].id}|${c.members[1].id}`}
            className="rounded-container flex flex-col gap-2 border p-4"
          >
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
                <div
                  key={m.id}
                  className={`rounded-element flex items-center gap-2 p-2 ${m.id === keepId ? 'bg-accent' : ''}`}
                >
                  <span className="font-medium">{m.title}</span>
                  {m.id === keepId && <Badge variant="default">canonical</Badge>}
                  <code className="text-muted-foreground text-13">{m.slug}</code>
                  {m.city && <span className="text-muted-foreground text-13">{m.city}</span>}
                  {typeof m.quality_score === 'number' && (
                    <Badge variant="outline">q {Math.round(m.quality_score)}</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Taxonomy duplicates: tags (propose/approve cockpit) + the settings vocabularies. */
function TaxonomyDuplicates() {
  const [taxo, setTaxo] = useState<'tags' | 'vocab'>('tags');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button
          variant={taxo === 'tags' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTaxo('tags')}
        >
          Tags
        </Button>
        <Button
          variant={taxo === 'vocab' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTaxo('vocab')}
        >
          Vocabularies
        </Button>
      </div>
      {taxo === 'tags' ? (
        <>
          <p className="text-muted-foreground text-15">
            Tags are governed by a propose/approve queue with a permanent “keep distinct” option —
            merges reparent every assignment and are reversible.
          </p>
          <TagMergeReviewQueue />
        </>
      ) : (
        <VocabMerge />
      )}
    </div>
  );
}
