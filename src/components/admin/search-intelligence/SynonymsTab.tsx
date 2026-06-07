import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  callSearchIntelligence,
  Synonym,
  SynonymList,
  SynonymCounts,
} from '@/hooks/useSearchIntelligence';

const PAGE_SIZE = 50;

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'archived', label: 'Archived' },
];

type DraftSynonym = {
  id?: string;
  terms: string;
  replacements: string;
  is_one_way: boolean;
  locale: string;
  indexes: string;
  notes: string;
  status: string;
};

const EMPTY_DRAFT: DraftSynonym = {
  terms: '',
  replacements: '',
  is_one_way: true,
  locale: '*',
  indexes: '',
  notes: '',
  status: 'approved',
};

function toList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function draftFrom(s: Synonym): DraftSynonym {
  return {
    id: s.id,
    terms: s.terms.join(', '),
    replacements: s.replacements.join(', '),
    is_one_way: s.is_one_way,
    locale: s.locale,
    indexes: s.indexes.join(', '),
    notes: s.notes ?? '',
    status: s.status,
  };
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'active') return 'default';
  if (status === 'archived') return 'destructive';
  return 'secondary';
}

export function SynonymsTab({ prefillTerm }: { prefillTerm?: string | null }) {
  const [counts, setCounts] = useState<SynonymCounts | null>(null);
  const [rows, setRows] = useState<Synonym[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftSynonym>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const loadCounts = useCallback(async () => {
    const res = await callSearchIntelligence<SynonymCounts>('synonyms/counts');
    if (res.success) setCounts(res.data);
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await callSearchIntelligence<SynonymList>('synonyms', {
      searchParams: {
        q: q || undefined,
        status: status === 'all' ? undefined : status,
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      },
    });
    if (!res.success) {
      setError(res.error);
      setBusy(false);
      return;
    }
    setRows(res.data?.rows ?? []);
    setTotal(res.data?.total ?? 0);
    setBusy(false);
  }, [q, status, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    void loadCounts();
  }, [loadCounts]);

  // Open the add dialog prefilled when arriving from a zero-result query.
  useEffect(() => {
    if (prefillTerm) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setDraft({ ...EMPTY_DRAFT, terms: prefillTerm });
      setDialogOpen(true);
    }
  }, [prefillTerm]);

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };
  const openEdit = (s: Synonym) => {
    setDraft(draftFrom(s));
    setDialogOpen(true);
  };

  const save = async () => {
    const terms = toList(draft.terms);
    const replacements = toList(draft.replacements);
    if (!terms.length || !replacements.length) {
      setError('Both terms and replacements are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      terms,
      replacements,
      is_one_way: draft.is_one_way,
      locale: draft.locale || '*',
      indexes: toList(draft.indexes),
      notes: draft.notes || undefined,
      status: draft.status,
    };
    const res = draft.id
      ? await callSearchIntelligence(`synonyms/${draft.id}`, { method: 'PATCH', body: payload })
      : await callSearchIntelligence('synonyms', { method: 'POST', body: payload });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setDialogOpen(false);
    await Promise.all([load(), loadCounts()]);
  };

  const setStatusOf = async (s: Synonym, next: string) => {
    const res = await callSearchIntelligence(`synonyms/${s.id}`, {
      method: 'PATCH',
      body: { status: next },
    });
    if (!res.success) {
      setError(res.error);
      return;
    }
    await Promise.all([load(), loadCounts()]);
  };

  const archive = async (s: Synonym) => {
    const res = await callSearchIntelligence(`synonyms/${s.id}`, { method: 'DELETE' });
    if (!res.success) {
      setError(res.error);
      return;
    }
    await Promise.all([load(), loadCounts()]);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h6 className="text-lg font-semibold mb-1">Synonyms</h6>
              <p className="text-sm text-muted-foreground">
                Only <strong>active</strong> synonyms reach live search (≤5 min cache). The rest are
                staged — activate to apply.
              </p>
            </div>
            <Button onClick={openCreate}>New synonym</Button>
          </div>
          {counts && (
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge variant="default">{counts.active} active</Badge>
              <Badge variant="secondary">{counts.approved} approved</Badge>
              {counts.pending > 0 && <Badge variant="secondary">{counts.pending} pending</Badge>}
              <Badge variant="outline">{counts.archived} archived</Badge>
              <Badge variant="outline">{counts.total} total</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col md:flex-row gap-4 md:items-end">
        <div className="flex flex-col gap-2 flex-1">
          <Label>Search term</Label>
          <Input
            placeholder="match across terms + replacements…"
            value={q}
            onChange={(e) => {
              setPage(0);
              setQ(e.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-2 min-w-[160px]">
          <Label>Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setPage(0);
              setStatus(v);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-destructive">{error}</p>}

      <Card>
        <CardContent>
          {busy && !rows.length ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No synonyms match.</p>
          ) : (
            <div className="flex flex-col divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
              {rows.map((s) => (
                <div key={s.id} className="flex flex-col md:flex-row md:items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-medium">{s.terms.join(', ')}</span>
                      <span className="text-muted-foreground">{s.is_one_way ? '→' : '↔'}</span>
                      <span>{s.replacements.join(', ')}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                      <Badge variant="outline" className="uppercase">
                        {s.locale}
                      </Badge>
                      {s.indexes.length > 0 && (
                        <Badge variant="outline">{s.indexes.join(' · ')}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.status === 'active' ? (
                      <Button variant="outline" size="sm" onClick={() => setStatusOf(s, 'approved')}>
                        Deactivate
                      </Button>
                    ) : (
                      s.status !== 'archived' && (
                        <Button variant="outline" size="sm" onClick={() => setStatusOf(s, 'active')}>
                          Activate
                        </Button>
                      )
                    )}
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                      Edit
                    </Button>
                    {s.status !== 'archived' && (
                      <Button variant="outline" size="sm" onClick={() => archive(s)}>
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">
                {total} results · page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit synonym' : 'New synonym'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Terms (comma-separated)</Label>
              <Input
                value={draft.terms}
                onChange={(e) => setDraft((d) => ({ ...d, terms: e.target.value }))}
                placeholder="bar"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Replacements (comma-separated)</Label>
              <Input
                value={draft.replacements}
                onChange={(e) => setDraft((d) => ({ ...d, replacements: e.target.value }))}
                placeholder="pub, kneipe"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>One-way</Label>
                <p className="text-xs text-muted-foreground">
                  off = bidirectional (terms ↔ replacements)
                </p>
              </div>
              <Switch
                checked={draft.is_one_way}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, is_one_way: v }))}
              />
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <Label>Locale</Label>
                <Input
                  value={draft.locale}
                  onChange={(e) => setDraft((d) => ({ ...d, locale: e.target.value }))}
                  placeholder="* or en"
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <Label>Indexes (comma-separated)</Label>
                <Input
                  value={draft.indexes}
                  onChange={(e) => setDraft((d) => ({ ...d, indexes: e.target.value }))}
                  placeholder="venues (blank = all)"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active (live)</SelectItem>
                  <SelectItem value="approved">Approved (staged)</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Notes</Label>
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
