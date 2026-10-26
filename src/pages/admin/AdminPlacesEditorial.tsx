import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { Link } from 'react-router';
import { useId, useState } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Sparkles } from '@/components/icons';
import { useMeta } from '@/hooks/useMeta';
import {
  type EditorialEntityType,
  type EditorialCoverRow,
  useGenerateDrafts,
  useAdminCovers,
  useToggleCoverPublished,
} from '@/hooks/useAdminEditorial';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';

export default function AdminPlacesEditorial() {
  useMeta({
    title: 'Editorial tools — Admin',
    description: 'Admin: drafts queue, covers. Rails moved to /admin/content/guides (format=list).',
    canonicalPath: '/admin/editorial-tools',
  });

  return (
    <div className="flex flex-col gap-6">
      {/* mb-0: the parent already spaces children with gap-6. */}
      <AdminArchetypeHeader className="mb-0" title="Editorial tools" />

      {/* Kept as body copy rather than dropped with the subtitle slot: the last
        sentence is a live POINTER — rails moved to Guides — and an operator who
        never finds it goes looking for a surface that no longer exists here. */}
      <p className="m-0 max-w-reading text-13 leading-relaxed text-muted-foreground">
        Generate LLM drafts, review hooks, curate covers for /places. Rails are now Guides (format
        “List”) at /admin/content/guides.
      </p>

      <Tabs defaultValue="drafts">
        <TabsList>
          <TabsTrigger value="drafts">Generate drafts</TabsTrigger>
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
            <TrackLoader size={16} className="mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Generate drafts
        </Button>
      </Card>

      <Button asChild variant="outline">
        <Link to="/admin?queue=editorial">Review generated drafts in the Review queue</Link>
      </Button>
    </div>
  );
}

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
        <AdminTextSkeleton lines={2} />
      ) : (covers.data ?? []).length === 0 ? (
        <AdminEmpty noun="covers" />
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
                  <Badge variant={c.published ? 'default' : 'secondary'} className="text-2xs">
                    {c.published ? 'published' : 'unpublished'}
                  </Badge>
                </div>
                {c.pull_quote && <p className="text-15 text-muted-foreground">{c.pull_quote}</p>}
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
