import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ExternalLink, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useQuests, useQuestMutations, type Quest } from '@/hooks/useQuests';

const STATUSES: Quest['status'][] = ['draft', 'scheduled', 'active', 'completed', 'archived'];
const ENTITY_TYPES = ['venue', 'event', 'personality', 'news', 'place'] as const;

interface FormState {
  id?: string;
  slug: string;
  title: string;
  brief_md: string;
  theme: string;
  hero_image_url: string;
  entity_type: string;
  target_count: string;
  tags: string;
  region: string;
  notes: string;
  starts_at: string;
  ends_at: string;
  status: Quest['status'];
}

const emptyForm: FormState = {
  slug: '',
  title: '',
  brief_md: '',
  theme: '',
  hero_image_url: '',
  entity_type: 'venue',
  target_count: '5',
  tags: '',
  region: '',
  notes: '',
  starts_at: '',
  ends_at: '',
  status: 'draft',
};

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function questToForm(q: Quest): FormState {
  return {
    id: q.id,
    slug: q.slug,
    title: q.title,
    brief_md: q.brief_md,
    theme: q.theme ?? '',
    hero_image_url: q.hero_image_url ?? '',
    entity_type: q.criteria_json.entity_type ?? 'venue',
    target_count: String(q.criteria_json.target_count ?? 5),
    tags: (q.criteria_json.tags ?? []).join(', '),
    region: q.criteria_json.region ?? '',
    notes: q.criteria_json.notes ?? '',
    starts_at: toLocalInput(q.starts_at),
    ends_at: toLocalInput(q.ends_at),
    status: q.status,
  };
}

function formToPayload(f: FormState): Partial<Quest> {
  const tags = f.tags.split(',').map((t) => t.trim()).filter(Boolean);
  return {
    slug: f.slug.trim(),
    title: f.title.trim(),
    brief_md: f.brief_md,
    theme: f.theme.trim() || null,
    hero_image_url: f.hero_image_url.trim() || null,
    criteria_json: {
      entity_type: f.entity_type as Quest['criteria_json']['entity_type'],
      target_count: Number(f.target_count) || 0,
      tags,
      region: f.region.trim() || undefined,
      notes: f.notes.trim() || undefined,
    },
    starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : undefined,
    ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : undefined,
    status: f.status,
  };
}

export default function AdminQuests() {
  const { data: quests, isLoading } = useQuests({ includeDraft: true });
  const { create, update, remove, createRecap } = useQuestMutations();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const sorted = useMemo(() => (quests ?? []).slice().sort((a, b) => b.starts_at.localeCompare(a.starts_at)), [quests]);

  const openNew = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (q: Quest) => { setForm(questToForm(q)); setOpen(true); };

  const save = async () => {
    const payload = formToPayload(form);
    if (!payload.slug || !payload.title || !payload.starts_at || !payload.ends_at) {
      toast.error('Slug, title, start, and end are required');
      return;
    }
    try {
      if (form.id) {
        await update.mutateAsync({ id: form.id, ...payload });
        toast.success('Quest updated');
      } else {
        await create.mutateAsync(payload);
        toast.success('Quest created');
      }
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async (q: Quest) => {
    if (!confirm(`Delete quest "${q.title}"?`)) return;
    try {
      await remove.mutateAsync(q.id);
      toast.success('Deleted');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleRecap = async (q: Quest) => {
    try {
      const articleId = await createRecap.mutateAsync(q.id);
      toast.success(`Recap stub created (${articleId.slice(0, 8)}…). Edit in News admin before publishing.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Editorial Quests</h1>
          <p className="text-sm text-muted-foreground">Time-bounded community challenges. One per month, community-led.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />New quest</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-element border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left">Slug</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Window</th>
                <th className="px-4 py-2 text-left">Target</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No quests yet.</td></tr>
              ) : sorted.map((q) => (
                <tr key={q.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{q.title}</td>
                  <td className="px-4 py-2 font-mono text-xs">{q.slug}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{q.status}</Badge></td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {new Date(q.starts_at).toLocaleDateString()} → {new Date(q.ends_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-xs">{q.criteria_json.target_count ?? '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" asChild title="View public page">
                        <a href={`/quests/${q.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleRecap(q)} title="Create recap stub"
                              disabled={!!q.recap_article_id || createRecap.isPending}>
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(q)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(q)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? 'Edit quest' : 'New quest'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title *"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Slug *"><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="pride-histories-2026" /></Field>
            <Field label="Theme"><Input value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} placeholder="Pride Histories" /></Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Quest['status'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Starts at *"><Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
            <Field label="Ends at *"><Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></Field>
            <Field label="Entity type">
              <Select value={form.entity_type} onValueChange={(v) => setForm({ ...form, entity_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Target count"><Input type="number" min={0} value={form.target_count} onChange={(e) => setForm({ ...form, target_count: e.target.value })} /></Field>
            <Field label="Tags (comma-separated)" full><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="lgbt-history, memorial, archive" /></Field>
            <Field label="Region" full><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Europe, North America, …" /></Field>
            <Field label="Hero image URL" full><Input value={form.hero_image_url} onChange={(e) => setForm({ ...form, hero_image_url: e.target.value })} /></Field>
            <Field label="Brief (Markdown)" full>
              <Textarea rows={6} value={form.brief_md} onChange={(e) => setForm({ ...form, brief_md: e.target.value })} placeholder="What is this quest? What counts? Why does it matter?" />
            </Field>
            <Field label="Criteria notes" full>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Acceptance hints for reviewers." />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <Label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
