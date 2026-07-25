import { useId, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, X, Sparkles } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import {
  type EditorialEntityType,
  type EditorialDraft,
  type EditorialCoverRow,
  usePendingDrafts,
  useEntityName,
  useGenerateDrafts,
  useSaveDraft,
  useApproveDraft,
  useRejectDraft,
  useAdminCovers,
  useToggleCoverPublished,
} from '@/hooks/useAdminEditorial';

export default function AdminPlacesEditorial() {
  useMeta({
    title: 'Editorial — Places',
    description: 'Admin: drafts queue, covers. Rails moved to /admin/content/guides (format=list).',
    canonicalPath: '/admin/places-editorial',
  });

  return (
    <div className="container mx-auto py-8 px-4 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-headline-lg font-bold tracking-tight">Editorial — Places</h1>
        <p className="text-15 text-muted-foreground">
          Generate LLM drafts, review hooks, curate covers for /places. Rails are now Guides
          (format “List”) at /admin/content/guides.
        </p>
      </header>

      <Tabs defaultValue="drafts">
        <TabsList>
          <TabsTrigger value="drafts">Hooks queue</TabsTrigger>
          <TabsTrigger value="covers">Covers</TabsTrigger>
        </TabsList>
        <TabsContent value="drafts" className="mt-6">
          <DraftsQueue />
        </TabsContent>
        <TabsContent value="covers" className="mt-6">
          <CoversEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drafts queue
// ---------------------------------------------------------------------------

function DraftsQueue() {
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<EditorialEntityType>('country');
  const [batchSize, setBatchSize] = useState(10);

  const entityTypeId = useId();
  const batchSizeId = useId();

  const drafts = usePendingDrafts(entityType);
  const generate = useGenerateDrafts();

  const handleGenerate = () => {
    generate.mutate(
      { entity_type: entityType, batch_size: batchSize },
      {
        onSuccess: (data) => {
          toast({
            title: 'Drafts generated',
            description: `${data.drafted} new, ${data.failed} failed of ${data.candidates} candidates.`,
          });
        },
        onError: (e) => {
          toast({
            title: 'Generation failed',
            description: e instanceof Error ? e.message : 'Unknown error',
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor={entityTypeId} className="text-15">
            Entity type
          </label>
          <select
            id={entityTypeId}
            className="border border-input rounded-element px-2 py-1 bg-background"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EditorialEntityType)}
          >
            <option value="country">Country</option>
            <option value="city">City</option>
            <option value="village">Village</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={batchSizeId} className="text-15">
            Batch size
          </label>
          <Input
            id={batchSizeId}
            type="number"
            min={1}
            max={50}
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className="w-20"
          />
        </div>
        <Button onClick={handleGenerate} disabled={generate.isPending}>
          {generate.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Generate drafts
        </Button>
      </Card>

      {drafts.isLoading ? (
        <p className="text-muted-foreground">Loading drafts…</p>
      ) : (drafts.data ?? []).length === 0 ? (
        <p className="text-muted-foreground">No pending drafts. Generate some.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {(drafts.data ?? []).map((d) => (
            <DraftRow key={d.id} draft={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftRow({ draft }: { draft: EditorialDraft }) {
  const { toast } = useToast();
  const [hook, setHook] = useState(draft.draft_hook ?? '');
  const [long, setLong] = useState(draft.draft_long ?? '');

  const hookId = useId();
  const longId = useId();

  const entityName = useEntityName(draft.entity_type, draft.entity_id);
  const save = useSaveDraft();
  const approve = useApproveDraft();
  const reject = useRejectDraft();

  const handleSave = () => {
    save.mutate(
      { id: draft.id, draft_hook: hook, draft_long: long || null },
      { onSuccess: () => toast({ title: 'Saved' }) },
    );
  };

  const handleApprove = async () => {
    try {
      await save.mutateAsync({ id: draft.id, draft_hook: hook, draft_long: long || null });
      await approve.mutateAsync(draft.id);
      toast({ title: 'Approved + published' });
    } catch (e) {
      toast({
        title: 'Approve failed',
        description: e instanceof Error ? e.message : 'Unknown',
        variant: 'destructive',
      });
    }
  };

  const handleReject = () => {
    reject.mutate(draft.id, { onSuccess: () => toast({ title: 'Rejected' }) });
  };

  return (
    <Card className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <p className="text-title font-semibold">{entityName.data ?? '…'}</p>
          <Badge variant="outline" className="text-2xs uppercase">
            {draft.entity_type}
          </Badge>
        </div>
        <p className="text-2xs text-muted-foreground">
          {new Date(draft.generated_at).toLocaleString()}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={hookId} className="text-2xs uppercase tracking-wide text-muted-foreground">
          Hook
        </label>
        <Input
          id={hookId}
          value={hook}
          onChange={(e) => setHook(e.target.value)}
          maxLength={140}
          placeholder="One-line editorial pull"
        />
        <p className="text-2xs text-muted-foreground">{hook.length}/120 recommended</p>
      </div>

      {draft.entity_type === 'country' && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={longId}
            className="text-2xs uppercase tracking-wide text-muted-foreground"
          >
            Long-form (optional)
          </label>
          <Textarea
            id={longId}
            value={long}
            onChange={(e) => setLong(e.target.value)}
            rows={4}
            placeholder="3–6 sentences for hero / rail features"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={handleApprove}
          disabled={save.isPending || approve.isPending || !hook.trim()}
          size="sm"
        >
          {approve.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Approve & publish
        </Button>
        <Button
          variant="outline"
          onClick={handleSave}
          disabled={save.isPending}
          size="sm"
        >
          Save draft
        </Button>
        <Button variant="outline" onClick={handleReject} disabled={reject.isPending} size="sm">
          <X className="h-4 w-4 mr-2" />
          Reject
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Covers editor
// ---------------------------------------------------------------------------

function CoversEditor() {
  const { toast } = useToast();
  const covers = useAdminCovers();
  const togglePublished = useToggleCoverPublished();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-15 text-muted-foreground">
        Covers are inserted via the database (or future inline form). For now, this view lists
        recent covers and lets you publish / unpublish them.
      </p>

      {covers.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (covers.data ?? []).length === 0 ? (
        <p className="text-muted-foreground">No covers yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {(covers.data ?? []).map((c: EditorialCoverRow) => (
            <Card key={c.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <p className="text-title font-semibold">{c.headline}</p>
                  <Badge variant="outline" className="text-2xs uppercase">
                    {c.entity_type}
                  </Badge>
                  <Badge
                    variant={c.published ? 'default' : 'secondary'}
                    className="text-2xs"
                  >
                    {c.published ? 'published' : 'unpublished'}
                  </Badge>
                </div>
                {c.pull_quote && (
                  <p className="text-15 text-muted-foreground">{c.pull_quote}</p>
                )}
                <p className="text-2xs text-muted-foreground">
                  Starts {new Date(c.starts_at).toLocaleDateString()}
                  {c.author ? ` · by ${c.author}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant={c.published ? 'outline' : 'default'}
                onClick={() =>
                  togglePublished.mutate(
                    { id: c.id, published: !c.published },
                    { onSuccess: () => toast({ title: 'Cover updated' }) },
                  )
                }
              >
                {c.published ? 'Unpublish' : 'Publish'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
