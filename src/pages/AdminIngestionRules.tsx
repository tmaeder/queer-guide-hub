import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState<Rule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ['ingestion_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ingestion_rules')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Rule[];
    },
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
      toast({ title: 'Rule saved' });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ingestion_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingestion_rules'] });
      toast({ title: 'Rule deleted' });
    },
  });

  const handleImport = async () => {
    const url = importUrl.trim();
    if (!url) return;
    const conn = pickConnector(url);
    if (!conn) {
      toast({ title: 'Unsupported URL', variant: 'destructive' });
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
      toast({
        title: 'Import failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
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
    <Box sx={{ maxWidth: 'lg', mx: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft style={{ height: 16, width: 16 }} /> Back to Admin
        </Button>
        <div>
          <Typography variant="h4" component="h1" sx={{ fontSize: '1.875rem', fontWeight: 700 }}>
            Ingestion Rules & URL Import
          </Typography>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Auto-tag/route community submissions; paste a URL to seed an inbox row.
          </p>
        </div>
      </Box>

      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 style={{ height: 18, width: 18 }} /> URL Import
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 1 }}>
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
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1, display: 'block' }}>
            Detects Bluesky / TikTok / generic OG-meta automatically. Submissions land in
            /admin/submissions for review.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <CardTitle>Rules</CardTitle>
            <Button onClick={openNew} size="sm" style={{ display: 'flex', gap: 6 }}>
              <Plus style={{ width: 14, height: 14 }} /> New rule
            </Button>
          </Box>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Typography variant="body2">Loading…</Typography>
          ) : rules.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No rules yet. Create one to auto-tag or escalate matching submissions.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {rules.map((r) => (
                <Box
                  key={r.id}
                  sx={{
                    p: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    flexWrap: 'wrap',
                  }}
                >
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(v: boolean) =>
                      upsertMut.mutate({ ...r, enabled: v })
                    }
                  />
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography variant="subtitle2">{r.name}</Typography>
                    {r.description && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {r.description}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
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
                    </Box>
                  </Box>
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
                </Box>
              ))}
            </Box>
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
    </Box>
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
          <Typography variant="overline" sx={{ mt: 1 }}>
            Match
          </Typography>
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
          <Typography variant="overline" sx={{ mt: 1 }}>
            Actions
          </Typography>
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch checked={forceReview} onCheckedChange={setForceReview} />
            <Typography variant="body2">Force review (status → pending)</Typography>
          </Box>
        </Box>
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
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}
