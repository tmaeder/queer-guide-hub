import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Plus, RefreshCw, Trash2, Edit2, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAdminRecognitions,
  useContributionMetrics,
  useRecognitionMutations,
  type RecognitionRow,
} from '@/hooks/useRecognitions';

const CATEGORIES = [
  { value: 'editorial', label: 'Editorial' },
  { value: 'venue_scout', label: 'Venue scout' },
  { value: 'history_documentarian', label: 'History documentarian' },
  { value: 'safety_reporter', label: 'Safety reporter' },
  { value: 'translator', label: 'Translator' },
  { value: 'quest_lead', label: 'Quest lead' },
  { value: 'community', label: 'Community' },
];

type Recognition = RecognitionRow;

export default function AdminRecognition() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [editing, setEditing] = useState<Recognition | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const recognitionsQ = useAdminRecognitions(year);
  const metricsQ = useContributionMetrics(year);
  const { upsert, remove, refreshMetrics } = useRecognitionMutations(year);

  const recognitions = useMemo(() => recognitionsQ.data ?? [], [recognitionsQ.data]);
  const metrics = metricsQ.data ?? [];
  const loading = recognitionsQ.isLoading;

  useEffect(() => {
    if (recognitionsQ.error)
      toast.error(`Recognitions: ${(recognitionsQ.error as Error).message}`);
  }, [recognitionsQ.error]);
  useEffect(() => {
    if (metricsQ.error) toast.error(`Metrics: ${(metricsQ.error as Error).message}`);
  }, [metricsQ.error]);

  const handleRefreshMetrics = () =>
    refreshMetrics.mutate(undefined, {
      onSuccess: () => toast.success('Metrics refreshed'),
      onError: (e) => toast.error((e as Error).message),
    });

  const handleDelete = (id: string) => {
    if (!confirm('Remove this recognition?')) return;
    remove.mutate(id, {
      onSuccess: () => toast.success('Removed'),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const recognizedUserIds = useMemo(
    () => new Set(recognitions.map((r) => r.user_id)),
    [recognitions],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Recognition Wall</h1>
          <p className="text-sm text-muted-foreground">
            Curate the annual /contributors/{year} page. Editorial only — not a live leaderboard.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Year</Label>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || currentYear)}
            className="w-24"
            min={2024}
            max={2100}
          />
          <Button variant="outline" size="sm" onClick={handleRefreshMetrics} disabled={refreshMetrics.isPending}>
            {refreshMetrics.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh metrics</span>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Curated list ({recognitions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : recognitions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No recognitions yet for {year}. Pick from the metrics below.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Blurb</TableHead>
                  <TableHead className="w-20">Featured</TableHead>
                  <TableHead className="w-20">Opted in</TableHead>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recognitions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.display_name_override || r.user_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.category}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                      {r.blurb_md || '—'}
                    </TableCell>
                    <TableCell>
                      {r.featured && <Star className="h-4 w-4" fill="currentColor" />}
                    </TableCell>
                    <TableCell>
                      {r.opted_in ? (
                        <Badge variant="default">Yes</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>{r.rank ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Top contributors by score ({metrics.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No contribution metrics for {year}. Refresh to recompute.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contributor</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Venues</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead>Opt-in</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.slice(0, 100).map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell className="font-medium">
                      {m.display_name || m.user_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.contribution_score}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.accepted_submissions}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.venue_submissions}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.event_submissions}
                    </TableCell>
                    <TableCell>
                      {m.appear_in_recognition ? (
                        <Badge variant="default">Yes</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {recognizedUserIds.has(m.user_id) ? (
                        <Badge variant="outline">Added</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditing({
                              id: '',
                              year,
                              user_id: m.user_id,
                              category: 'community',
                              blurb_md: '',
                              display_name_override: m.display_name,
                              featured: false,
                              opted_in: m.appear_in_recognition,
                              rank: null,
                            })
                          }
                        >
                          Add
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RecognitionEditDialog
        open={!!editing}
        recognition={editing}
        upsert={upsert}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          recognitionsQ.refetch();
        }}
      />
      <RecognitionEditDialog
        open={createOpen}
        upsert={upsert}
        recognition={
          createOpen
            ? {
                id: '',
                year,
                user_id: '',
                category: 'community',
                blurb_md: '',
                display_name_override: null,
                featured: false,
                opted_in: false,
                rank: null,
              }
            : null
        }
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          recognitionsQ.refetch();
        }}
      />
    </div>
  );
}

function RecognitionEditDialog({
  open,
  recognition,
  upsert,
  onClose,
  onSaved,
}: {
  open: boolean;
  recognition: Recognition | null;
  upsert: ReturnType<typeof useRecognitionMutations>['upsert'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Recognition | null>(recognition);

  useEffect(() => {
    setForm(recognition);
  }, [recognition]);

  if (!form) return null;
  const saving = upsert.isPending;

  const handleSave = async () => {
    if (!form.user_id) {
      toast.error('user_id required');
      return;
    }
    const error = await upsert
      .mutateAsync({
        id: form.id || undefined,
        year: form.year,
        user_id: form.user_id,
        category: form.category,
        blurb_md: form.blurb_md || null,
        display_name_override: form.display_name_override || null,
        featured: form.featured,
        opted_in: form.opted_in,
        rank: form.rank,
      })
      .then(() => null)
      .catch((e: unknown) => e as Error);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Saved');
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Edit recognition' : 'Add recognition'}</DialogTitle>
          <DialogDescription>
            Curated entry on the /contributors/{form.year} page.
            <br />
            <strong>Opted in</strong> must be true for it to appear publicly.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>User ID</Label>
            <Input
              value={form.user_id}
              onChange={(e) => setForm({ ...form, user_id: e.target.value })}
              placeholder="uuid"
              disabled={!!form.id}
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setForm({ ...form, category: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Blurb (markdown, short)</Label>
            <Textarea
              value={form.blurb_md ?? ''}
              onChange={(e) => setForm({ ...form, blurb_md: e.target.value })}
              rows={3}
            />
          </div>
          <div>
            <Label>Display name override (optional pseudonym)</Label>
            <Input
              value={form.display_name_override ?? ''}
              onChange={(e) =>
                setForm({ ...form, display_name_override: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Rank</Label>
              <Input
                type="number"
                value={form.rank ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    rank: e.target.value ? parseInt(e.target.value, 10) : null,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <div className="flex items-center justify-between">
                <Label>Featured</Label>
                <Switch
                  checked={form.featured}
                  onCheckedChange={(v) => setForm({ ...form, featured: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Opted in</Label>
                <Switch
                  checked={form.opted_in}
                  onCheckedChange={(v) => setForm({ ...form, opted_in: v })}
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
