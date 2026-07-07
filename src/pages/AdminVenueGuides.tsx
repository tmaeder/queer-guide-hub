import { useMemo, useState } from 'react';
import { useMeta } from '@/hooks/useMeta';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useAdminVenueGuidesList,
  useAdminVenueGuide,
  useUpsertVenueGuide,
  useUpsertVenuePick,
  useDeleteVenuePick,
  useVenueSearch,
  venueGuidePublishBlockers,
  type AdminVenuePickWithVenue,
} from '@/hooks/useAdminVenueGuides';
import {
  Plus,
  Trash2,
  Search,
  AlertCircle,
  Check,
  ExternalLink,
  GripVertical,
  Sparkles,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MarkdownTextarea } from '@/components/admin/MarkdownTextarea';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type GuideRow = Database['public']['Tables']['venue_guides']['Row'];
type GuideInsert = Database['public']['Tables']['venue_guides']['Insert'];
type PickTier = Database['public']['Tables']['venue_guide_picks']['Row']['tier'];

const TIERS: PickTier[] = ['top', 'also_great', 'upgrade', 'budget', 'avoid'];
const TIER_LABEL: Record<PickTier, string> = {
  top: 'Our pick',
  also_great: 'Also great',
  upgrade: 'Worth the upgrade',
  budget: 'Easy choice',
  avoid: 'Skip this one',
};
const STATUS_OPTIONS = ['draft', 'review', 'published', 'archived'] as const;
const VENUE_CATEGORIES = [
  'bar', 'club', 'restaurant', 'sauna', 'hotel',
  'community_center', 'event-venue', 'theater', 'salon', 'other',
] as const;

function emptyGuide(): GuideInsert {
  return {
    slug: '',
    title: '',
    dek: '',
    intro_md: '',
    hero_image_path: '',
    category: 'bar',
    audience_tags: [],
    status: 'draft',
    is_featured: false,
  };
}

function PickEditor({
  guideId,
  pick,
  onRemove,
}: {
  guideId: string;
  pick: AdminVenuePickWithVenue;
  onRemove: () => void;
}) {
  const upsertPick = useUpsertVenuePick();
  const [tier, setTier] = useState<PickTier>(pick.tier);
  const [rationale, setRationale] = useState(pick.rationale_md ?? '');
  const [prosText, setProsText] = useState(pick.pros.join('\n'));
  const [consText, setConsText] = useState(pick.cons.join('\n'));
  const [position, setPosition] = useState(pick.position);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: pick.id });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const save = () => {
    upsertPick.mutate({
      id: pick.id,
      guide_id: guideId,
      venue_id: pick.venue_id,
      tier,
      rationale_md: rationale.trim() || null,
      pros: prosText.split('\n').map((s) => s.trim()).filter(Boolean),
      cons: consText.split('\n').map((s) => s.trim()).filter(Boolean),
      position,
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className="rounded-container border border-border p-4 space-y-4 bg-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 -ml-1 mt-0.5"
            aria-label="Drag to reorder"
          >
            <GripVertical size={16} />
          </button>
          <div className="min-w-0">
            <p className="text-15 font-medium">{pick.venue?.name ?? '(missing venue)'}</p>
            <p className="text-13 text-muted-foreground">
              {[pick.venue?.category, pick.venue?.city].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove pick">
          <Trash2 size={16} />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label className="text-13">Tier</Label>
          <Select value={tier} onValueChange={(v) => setTier(v as PickTier)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => (
                <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-13">Position (within tier)</Label>
          <Input
            type="number"
            value={position}
            onChange={(e) => setPosition(parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </div>
      <div>
        <Label className="text-13">Rationale (markdown)</Label>
        <MarkdownTextarea
          rows={3}
          value={rationale}
          onChange={setRationale}
          placeholder="Why we picked it — one or two sentences."
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-13">Pros (one per line)</Label>
          <Textarea rows={4} value={prosText} onChange={(e) => setProsText(e.target.value)} />
        </div>
        <div>
          <Label className="text-13">Cons (one per line)</Label>
          <Textarea rows={4} value={consText} onChange={(e) => setConsText(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={upsertPick.isPending} size="sm">
          {upsertPick.isPending ? 'Saving…' : 'Save pick'}
        </Button>
      </div>
    </div>
  );
}

function PickAdder({ guideId, existingIds }: { guideId: string; existingIds: Set<string> }) {
  const [q, setQ] = useState('');
  const { data: results = [] } = useVenueSearch(q);
  const upsertPick = useUpsertVenuePick();
  const candidates = results.filter((r) => !existingIds.has(r.id));

  const add = (venueId: string) => {
    upsertPick.mutate(
      {
        guide_id: guideId,
        venue_id: venueId,
        tier: 'also_great',
        position: 0,
        pros: [],
        cons: [],
      },
      { onSuccess: () => setQ('') },
    );
  };

  return (
    <div className="rounded-container border border-dashed border-border p-4 space-y-4">
      <Label className="text-13 uppercase tracking-[0.1em] text-muted-foreground">
        Add a pick
      </Label>
      <div className="relative">
        <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search venues by name…"
          className="pl-10"
        />
      </div>
      {q.trim().length >= 2 && candidates.length === 0 && (
        <p className="text-13 text-muted-foreground">No matches.</p>
      )}
      {candidates.length > 0 && (
        <ul className="divide-y divide-border max-h-72 overflow-y-auto rounded-element border border-border">
          {candidates.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 p-2 hover:bg-muted/40">
              <div className="min-w-0">
                <p className="text-15 truncate">{r.name}</p>
                <p className="text-13 text-muted-foreground truncate">
                  {[r.category, r.city].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => add(r.id)}>
                <Plus size={14} aria-hidden /> Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SortablePicksList({
  guideId,
  picks,
  onRemove,
}: {
  guideId: string;
  picks: AdminVenuePickWithVenue[];
  onRemove: (id: string) => void;
}) {
  const upsertPick = useUpsertVenuePick();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = picks.findIndex((p) => p.id === active.id);
    const newIndex = picks.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(picks, oldIndex, newIndex);
    const movedPick = picks[oldIndex];
    const targetTier = picks[newIndex].tier;
    const tierChanged = movedPick.tier !== targetTier;
    const tiersToFix = tierChanged
      ? new Set([movedPick.tier, targetTier])
      : new Set([targetTier]);

    for (const tier of tiersToFix) {
      const tierPicks = reordered.filter((p) =>
        p.id === movedPick.id ? tier === targetTier : p.tier === tier,
      );
      tierPicks.forEach((p, idx) => {
        const newTier = p.id === movedPick.id ? targetTier : p.tier;
        if (p.position === idx && p.tier === newTier) return;
        upsertPick.mutate({
          id: p.id,
          guide_id: guideId,
          venue_id: p.venue_id,
          tier: newTier,
          rationale_md: p.rationale_md ?? null,
          pros: p.pros,
          cons: p.cons,
          position: idx,
        });
      });
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={picks.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {picks.map((p) => (
            <PickEditor
              key={`${p.id}:${p.updated_at}`}
              guideId={guideId}
              pick={p}
              onRemove={() => onRemove(p.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function GuideEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useAdminVenueGuide(id);
  const upsert = useUpsertVenueGuide();
  const removePick = useDeleteVenuePick();
  const upsertPick = useUpsertVenuePick();

  const guide = data?.guide ?? null;
  const picks = useMemo(() => data?.picks ?? [], [data?.picks]);
  const blockers = useMemo(() => venueGuidePublishBlockers(guide, picks), [guide, picks]);
  const canPublish = blockers.length === 0;

  const [draft, setDraft] = useState<GuideInsert | null>(null);
  const current = draft ?? guide;
  const [generating, setGenerating] = useState(false);

  const updateField = <K extends keyof GuideInsert>(k: K, v: GuideInsert[K]) =>
    setDraft({ ...(current ?? {}), [k]: v } as GuideInsert);

  const generateDraft = async () => {
    if (picks.length === 0) {
      toast({ title: 'Add picks first', description: 'Need at least one pick to generate a draft.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke<{
        draft: {
          intro_md: string;
          picks: Array<{ venue_id: string; rationale_md: string; pros: string[]; cons: string[] }>;
        };
        error?: string;
      }>('venue-guide-draft', { body: { guide_id: id } });
      if (error || !resp?.draft) throw new Error(error?.message ?? resp?.error ?? 'no draft returned');

      if (resp.draft.intro_md) updateField('intro_md', resp.draft.intro_md);

      const byVenue = new Map(picks.map((p) => [p.venue_id, p]));
      let pickUpdates = 0;
      for (const suggestion of resp.draft.picks ?? []) {
        const existing = byVenue.get(suggestion.venue_id);
        if (!existing) continue;
        await new Promise<void>((resolve) => {
          upsertPick.mutate(
            {
              id: existing.id,
              guide_id: id,
              venue_id: existing.venue_id,
              tier: existing.tier,
              rationale_md: suggestion.rationale_md || existing.rationale_md,
              pros: suggestion.pros?.length ? suggestion.pros : existing.pros,
              cons: suggestion.cons?.length ? suggestion.cons : existing.cons,
              position: existing.position,
            },
            { onSuccess: () => resolve(), onError: () => resolve() },
          );
        });
        pickUpdates++;
      }
      toast({
        title: 'Draft generated',
        description: `Intro updated · ${pickUpdates} pick${pickUpdates === 1 ? '' : 's'} suggested.`,
      });
    } catch (e) {
      toast({ title: 'Generation failed', description: String((e as Error).message ?? e), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const save = (nextStatus?: GuideRow['status']) => {
    if (!current) return;
    upsert.mutate(
      { ...current, id, status: nextStatus ?? current.status },
      {
        onSuccess: () => { toast({ title: 'Saved' }); setDraft(null); },
        onError: (e) => toast({ title: 'Save failed', description: String(e), variant: 'destructive' }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{guide?.title || 'Guide'}</DialogTitle>
        </DialogHeader>

        {isLoading || !current ? (
          <p className="text-13 text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-6">
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Title</Label>
                <Input value={current.title ?? ''} onChange={(e) => updateField('title', e.target.value)} />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={current.slug ?? ''} disabled className="opacity-60" />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={(current.status ?? 'draft') as string}
                  onValueChange={(v) => updateField('status', v as GuideRow['status'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Dek (subhead)</Label>
                <Input value={current.dek ?? ''} onChange={(e) => updateField('dek', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Intro (markdown — min 80 chars)</Label>
                <MarkdownTextarea
                  rows={5}
                  value={current.intro_md ?? ''}
                  onChange={(v) => updateField('intro_md', v)}
                />
                <p className="text-2xs text-muted-foreground mt-1">{(current.intro_md ?? '').trim().length} / 80</p>
              </div>
              <div>
                <Label>Hero image (R2 path or URL)</Label>
                <Input value={current.hero_image_path ?? ''} onChange={(e) => updateField('hero_image_path', e.target.value)} />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={current.category ?? 'bar'}
                  onValueChange={(v) => updateField('category', v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VENUE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Audience tags (comma-separated)</Label>
                <Input
                  value={(current.audience_tags ?? []).join(', ')}
                  onChange={(e) =>
                    updateField(
                      'audience_tags',
                      e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    )
                  }
                  placeholder="nightlife, techno, first_visit"
                />
              </div>
              <label className="flex items-center gap-2 text-15">
                <input type="checkbox" checked={!!current.is_featured} onChange={(e) => updateField('is_featured', e.target.checked)} />
                Featured
              </label>
            </section>

            <section className="rounded-container border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                {canPublish ? (
                  <>
                    <Check size={16} className="text-foreground" aria-hidden />
                    <span className="text-13 uppercase tracking-[0.1em]">Ready to publish</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={16} className="text-foreground/60" aria-hidden />
                    <span className="text-13 uppercase tracking-[0.1em] text-muted-foreground">
                      Pre-flight ({blockers.length} blocker{blockers.length !== 1 ? 's' : ''})
                    </span>
                  </>
                )}
              </div>
              {!canPublish && (
                <ul className="space-y-1 text-15">
                  {blockers.map((b, i) => <li key={i} className="text-muted-foreground">· {b}</li>)}
                </ul>
              )}
            </section>

            <section className="space-y-4">
              <header className="flex items-center justify-between">
                <h3 className="text-title">Picks ({picks.length})</h3>
                <p className="text-2xs uppercase tracking-[0.15em] text-muted-foreground">Drag to reorder</p>
              </header>
              <SortablePicksList guideId={id} picks={picks} onRemove={(pid) => removePick.mutate(pid)} />
              <PickAdder guideId={id} existingIds={new Set(picks.map((p) => p.venue_id))} />
            </section>
          </div>
        )}

        <DialogFooter className="gap-2">
          {guide && (
            <Button asChild variant="ghost" size="sm">
              <a href={`/venues/guides/${guide.slug}`} target="_blank" rel="noopener noreferrer">
                Open public page <ExternalLink size={14} aria-hidden />
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={generateDraft}
            disabled={generating || picks.length === 0}
            title="Calls Claude to suggest intro + per-pick rationale/pros/cons."
          >
            <Sparkles size={14} aria-hidden />
            {generating ? 'Generating…' : 'Generate draft'}
          </Button>
          <Button variant="outline" onClick={() => save()} disabled={upsert.isPending}>Save</Button>
          <Button onClick={() => save('published')} disabled={!canPublish || upsert.isPending}>
            Save & publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewGuideDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const upsert = useUpsertVenueGuide();
  const [g, setG] = useState<GuideInsert>(emptyGuide());

  const create = () => {
    if (!g.title.trim() || !g.slug.trim()) {
      toast({ title: 'Title and slug are required', variant: 'destructive' });
      return;
    }
    upsert.mutate(g, {
      onSuccess: (row) => { toast({ title: 'Guide created' }); onCreated(row.id); },
      onError: (e) => toast({ title: 'Create failed', description: String(e), variant: 'destructive' }),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New venue guide</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} />
          </div>
          <div>
            <Label>Slug (URL-safe, lowercase)</Label>
            <Input
              value={g.slug}
              onChange={(e) => setG({ ...g, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={g.category ?? 'bar'} onValueChange={(v) => setG({ ...g, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VENUE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={upsert.isPending}>
            {upsert.isPending ? 'Creating…' : 'Create draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GuideRowItem({ g, onEdit }: { g: GuideRow; onEdit: (id: string) => void }) {
  const status = g.status as string;
  const dot =
    status === 'published' ? 'bg-foreground'
      : status === 'review' ? 'bg-foreground/60'
      : status === 'archived' ? 'bg-foreground/30'
      : 'bg-foreground/20';
  return (
    <tr className="border-b border-border hover:bg-muted/40">
      <td className="p-2 align-top">
        <div className="flex items-start gap-2">
          <span aria-hidden className={`mt-2 size-2 rounded-full ${dot}`} />
          <button
            type="button"
            onClick={() => onEdit(g.id)}
            className="text-left text-15 font-medium hover:underline underline-offset-4"
          >
            {g.title}
          </button>
        </div>
        <p className="text-13 text-muted-foreground mt-1">/{g.slug}</p>
      </td>
      <td className="p-2 align-top text-13 uppercase tracking-[0.1em] text-muted-foreground">
        {status}
        {g.is_featured && <Badge variant="outline" className="ml-2 rounded-badge text-2xs">featured</Badge>}
      </td>
      <td className="p-2 align-top text-13">{g.category ?? '—'}</td>
      <td className="p-2 align-top text-13 text-right">{g.pick_count}</td>
      <td className="p-2 align-top text-13 text-muted-foreground text-right">
        {new Date(g.updated_at).toLocaleDateString()}
      </td>
    </tr>
  );
}

const AdminVenueGuides = () => {
  useMeta({
    title: 'Venue Guides — Admin',
    canonicalPath: '/admin/venue-guides',
    noIndex: true,
  });

  const { data: guides = [], isLoading } = useAdminVenueGuidesList();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(
    () => (statusFilter === 'all' ? guides : guides.filter((g) => g.status === statusFilter)),
    [guides, statusFilter],
  );

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg leading-tight">Venue Guides</h1>
          <p className="text-15 text-muted-foreground">
            Wirecutter-style editorial guides surfaced on /venues.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={14} aria-hidden /> New guide
        </Button>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        {['all', ...STATUS_OPTIONS].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s}{' '}
            {s !== 'all' && (
              <span className="ml-2 text-2xs text-muted-foreground">
                {guides.filter((g) => g.status === s).length}
              </span>
            )}
          </Button>
        ))}
      </div>

      <div className="rounded-container border border-border overflow-x-auto">
        {isLoading ? (
          <p className="p-8 text-13 text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-13 text-muted-foreground">No guides match.</p>
        ) : (
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2 text-13 uppercase tracking-[0.1em] text-muted-foreground">Title</th>
                <th className="text-left p-2 text-13 uppercase tracking-[0.1em] text-muted-foreground">Status</th>
                <th className="text-left p-2 text-13 uppercase tracking-[0.1em] text-muted-foreground">Category</th>
                <th className="text-right p-2 text-13 uppercase tracking-[0.1em] text-muted-foreground">Picks</th>
                <th className="text-right p-2 text-13 uppercase tracking-[0.1em] text-muted-foreground">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => <GuideRowItem key={g.id} g={g} onEdit={setEditingId} />)}
            </tbody>
          </table>
        )}
      </div>

      {editingId && <GuideEditor id={editingId} onClose={() => setEditingId(null)} />}
      {creating && (
        <NewGuideDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); setEditingId(id); }}
        />
      )}
    </div>
  );
};

export default AdminVenueGuides;
