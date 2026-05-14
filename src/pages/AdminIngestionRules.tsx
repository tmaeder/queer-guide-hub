import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Pencil, Link2 } from 'lucide-react';

interface Rule {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  match: {
    platforms?: string[];
    any_of?: string[];
    all_of?: string[];
    regex?: string;
  };
  actions: {
    add_labels?: string[];
    set_priority?: number;
    set_status?: string;
    force_review?: boolean;
    set_permission_level?: string;
  };
  created_at: string;
  updated_at: string;
}

const URL_CONNECTORS: Array<{ test: RegExp; fn: string; label: string }> = [
  { test: /(^|\.)bsky\.app$/i, fn: 'source-bluesky-url', label: 'Bluesky' },
  { test: /(^|\.)tiktok\.com$/i, fn: 'source-tiktok-url', label: 'TikTok' },
  { test: /.*/, fn: 'source-social-url', label: 'Generic OG meta' },
];

function pickConnector(url: string): { fn: string; label: string } | null {
  try {
    const host = new URL(url).hostname;
    for (const c of URL_CONNECTORS) {
      if (c.test.test(host)) return { fn: c.fn, label: c.label };
    }
  } catch {
    return null;
  }
  return null;
}

export default function AdminIngestionRules() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editing, setEditing] = useState<Rule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ['ingestion_rules'],
    queryFn: () =>
      listFrom<Rule>('ingestion_rules', '*', { col: 'priority', ascending: true }),
  });

  const upsertMut = useMutation({
    mutationFn: async (rule: Partial<Rule>) => {
      if (rule.id) {
        const { error } = await supabase
          .from('ingestion_rules')
          .update({
            name: rule.name ?? '',
            description: rule.description,
            enabled: rule.enabled,
            priority: rule.priority,
            match: rule.match as never,
            actions: rule.actions as never,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ingestion_rules').insert({
          name: rule.name ?? '',
          description: rule.description,
          enabled: rule.enabled ?? true,
          priority: rule.priority ?? 100,
          match: (rule.match ?? {}) as never,
          actions: (rule.actions ?? {}) as never,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingestion_rules'] });
      setDialogOpen(false);
      setEditing(null);
      toast.success('Rule saved');
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ingestion_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingestion_rules'] });
      toast.success('Rule deleted');
    },
  });

  const handleImport = async () => {
    const url = importUrl.trim();
    if (!url) return;
    const conn = pickConnector(url);
    if (!conn) {
      toast.error('Unsupported URL');
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke(conn.fn, { body: { url } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: `Imported via ${conn.label}`,
        description: data?.submission_id ? `Submission ${data.submission_id.slice(0, 8)}…` : '',
      });
      setImportUrl('');
    } catch (err) {
      toast.error(`Import failed: ${err}`);
    } finally {
      setImporting(false);
    }
  };

  const openNew = () => {
    setEditing({
      id: '',
      name: '',
      description: '',
      enabled: true,
      priority: 100,
      match: {},
      actions: {},
      created_at: '',
      updated_at: '',
    });
    setDialogOpen(true);
  };

  return (
    <div className="max-w-screen-lg mx-auto p-6 flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft style={{ height: 16, width: 16 }} /> Back to Admin
        </Button>
        <div>
          <h4 className="text-xl font-bold">
            Ingestion Rules & URL Import
          </h4>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Auto-tag/route community submissions; paste a URL to seed an inbox row.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 style={{ height: 18, width: 18 }} /> URL Import
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="https://bsky.app/profile/… or https://www.tiktok.com/… or any URL"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleImport();
              }}
              style={{ flex: 1 }}
            />
            <Button onClick={handleImport} disabled={importing || !importUrl}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Detects Bluesky / TikTok / generic OG-meta automatically. Submissions land in
            /admin/submissions for review.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Rules</CardTitle>
            <Button onClick={openNew} size="sm" style={{ display: 'flex', gap: 6 }}>
              <Plus style={{ width: 14, height: 14 }} /> New rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="text-sm">
              No rules yet. Create one to auto-tag or escalate matching submissions.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {rules.map((r) => (
                <div key={r.id} className="p-3 border border-border flex items-center gap-3 flex-wrap">
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(v: boolean) =>
                      upsertMut.mutate({ ...r, enabled: v })
                    }
                  />
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium">{r.name}</p>
                    {r.description && (
                      <p className="text-xs text-muted-foreground">
                        {r.description}
                      </p>
                    )}
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {r.match.platforms?.map((p) => (
                        <Badge key={p} variant="outline" style={{ fontSize: 10 }}>
                          {p}
                        </Badge>
                      ))}
                      {r.match.any_of && (
                        <Badge variant="secondary" style={{ fontSize: 10 }}>
                          any: {r.match.any_of.length}
                        </Badge>
                      )}
                      {r.match.all_of && (
                        <Badge variant="secondary" style={{ fontSize: 10 }}>
                          all: {r.match.all_of.length}
                        </Badge>
                      )}
                      {r.match.regex && (
                        <Badge variant="secondary" style={{ fontSize: 10 }}>
                          regex
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline">prio {r.priority}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(r);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil style={{ width: 14, height: 14 }} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete rule "${r.name}"?`)) deleteMut.mutate(r.id);
                    }}
                  >
                    <Trash2 style={{ width: 14, height: 14, color: '#ef4444' }} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RuleEditDialog
        rule={editing}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSave={(r) => upsertMut.mutate(r)}
        saving={upsertMut.isPending}
      />
    </div>
  );
}

interface DialogProps {
  rule: Rule | null;
  open: boolean;
  onClose: () => void;
  onSave: (r: Partial<Rule>) => void;
  saving: boolean;
}

function RuleEditDialog({ rule, open, onClose, onSave, saving }: DialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(100);
  const [platforms, setPlatforms] = useState('');
  const [anyOf, setAnyOf] = useState('');
  const [allOf, setAllOf] = useState('');
  const [regex, setRegex] = useState('');
  const [addLabels, setAddLabels] = useState('');
  const [setPriorityVal, setSetPriorityVal] = useState('');
  const [forceReview, setForceReview] = useState(false);

  useEffect(() => {
    if (!rule || !open) return;
    setName(rule.name);
    setDescription(rule.description ?? '');
    setPriority(rule.priority);
    setPlatforms(rule.match.platforms?.join(', ') ?? '');
    setAnyOf(rule.match.any_of?.join(', ') ?? '');
    setAllOf(rule.match.all_of?.join(', ') ?? '');
    setRegex(rule.match.regex ?? '');
    setAddLabels(rule.actions.add_labels?.join(', ') ?? '');
    setSetPriorityVal(
      typeof rule.actions.set_priority === 'number' ? String(rule.actions.set_priority) : '',
    );
    setForceReview(Boolean(rule.actions.force_review));
  }, [rule, open]);

  const splitCsv = (s: string): string[] =>
    s.split(',').map((x) => x.trim()).filter(Boolean);

  const handleSave = () => {
    if (!name.trim()) return;
    const match: Rule['match'] = {};
    if (platforms) match.platforms = splitCsv(platforms);
    if (anyOf) match.any_of = splitCsv(anyOf);
    if (allOf) match.all_of = splitCsv(allOf);
    if (regex) match.regex = regex;
    const actions: Rule['actions'] = {};
    if (addLabels) actions.add_labels = splitCsv(addLabels);
    if (setPriorityVal) actions.set_priority = Number(setPriorityVal);
    if (forceReview) actions.force_review = true;

    onSave({
      id: rule?.id || undefined,
      name: name.trim(),
      description: description.trim() || null,
      enabled: rule?.enabled ?? true,
      priority,
      match,
      actions,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={{ maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>{rule?.id ? 'Edit rule' : 'New rule'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              style={{ minHeight: 50 }}
            />
          </Field>
          <Field label="Priority (lower runs first)">
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
          </Field>
          <p>
            Match
          </p>
          <Field label="Platforms (csv: telegram, tiktok, …)">
            <Input value={platforms} onChange={(e) => setPlatforms(e.target.value)} />
          </Field>
          <Field label="Any of (csv terms — match if any present)">
            <Input value={anyOf} onChange={(e) => setAnyOf(e.target.value)} />
          </Field>
          <Field label="All of (csv terms — match only if all present)">
            <Input value={allOf} onChange={(e) => setAllOf(e.target.value)} />
          </Field>
          <Field label="Regex (case-insensitive)">
            <Input value={regex} onChange={(e) => setRegex(e.target.value)} />
          </Field>
          <p>
            Actions
          </p>
          <Field label="Add labels (csv)">
            <Input value={addLabels} onChange={(e) => setAddLabels(e.target.value)} />
          </Field>
          <Field label="Set priority (max with current)">
            <Input
              type="number"
              value={setPriorityVal}
              onChange={(e) => setSetPriorityVal(e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Switch checked={forceReview} onCheckedChange={setForceReview} />
            <p className="text-sm">Force review (status → pending)</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
