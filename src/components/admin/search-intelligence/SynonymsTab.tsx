import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { callSearchIntelligence, Synonym } from '@/hooks/useSearchIntelligence';

const STATUS_COLORS: Record<Synonym['status'], 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  approved: 'secondary',
  active: 'default',
  rejected: 'destructive',
  archived: 'destructive',
};

export function SynonymsTab() {
  const [items, setItems] = useState<Synonym[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [terms, setTerms] = useState('');
  const [replacements, setReplacements] = useState('');
  const [locale, setLocale] = useState('*');
  const [indexes, setIndexes] = useState('');
  const [oneWay, setOneWay] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const res = await callSearchIntelligence<Synonym[]>('synonyms', {
      searchParams: { status: statusFilter || undefined, limit: '200' },
    });
    if (!res.success) setError(res.error);
    else {
      setItems(res.data);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const create = async () => {
    setBusy('create');
    const res = await callSearchIntelligence<Synonym>('synonyms', {
      method: 'POST',
      body: {
        terms: terms.split(',').map((s) => s.trim()).filter(Boolean),
        replacements: replacements.split(',').map((s) => s.trim()).filter(Boolean),
        locale: locale || '*',
        indexes: indexes.split(',').map((s) => s.trim()).filter(Boolean),
        is_one_way: oneWay,
      },
    });
    if (!res.success) setError(res.error);
    else {
      setTerms('');
      setReplacements('');
      setIndexes('');
      await refresh();
    }
    setBusy(null);
  };

  const setStatus = async (id: string, status: Synonym['status']) => {
    setBusy(id);
    const res = await callSearchIntelligence<Synonym>(`synonyms/${id}`, {
      method: 'PATCH',
      body: { status },
    });
    if (!res.success) setError(res.error);
    await refresh();
    setBusy(null);
  };

  const archive = async (id: string) => {
    setBusy(id);
    const res = await callSearchIntelligence<Synonym>(`synonyms/${id}`, { method: 'DELETE' });
    if (!res.success) setError(res.error);
    await refresh();
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="pt-6">
          <h6 className="text-lg font-medium mb-4">New synonym</h6>
          <div className="flex flex-col md:flex-row gap-4 md:items-end flex-wrap">
            <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
              <Label htmlFor="syn-terms">Terms (comma separated)</Label>
              <Input id="syn-terms" value={terms} onChange={(e) => setTerms(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
              <Label htmlFor="syn-repl">Replacements (comma separated)</Label>
              <Input id="syn-repl" value={replacements} onChange={(e) => setReplacements(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2 w-[100px]">
              <Label htmlFor="syn-locale">Locale</Label>
              <Input id="syn-locale" value={locale} onChange={(e) => setLocale(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2 min-w-[200px]">
              <Label htmlFor="syn-idx">Indexes (blank = all)</Label>
              <Input id="syn-idx" value={indexes} onChange={(e) => setIndexes(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="syn-oneway" checked={oneWay} onCheckedChange={setOneWay} />
              <Label htmlFor="syn-oneway">One-way</Label>
            </div>
            <Button onClick={create} disabled={busy === 'create' || !terms || !replacements}>
              {busy === 'create' ? 'Creating…' : 'Create (pending)'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 block">
            New synonyms start in <code>pending</code>. They reach Meilisearch only after an admin
            sets them to <code>active</code>.
          </p>
        </CardContent>
      </Card>

      <div>
        <div className="flex flex-row gap-4 items-center mb-4">
          <h6 className="text-lg font-medium">Synonyms</h6>
          <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="min-w-[140px] h-9 w-auto"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-destructive">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">No synonyms.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((s) => (
              <Card key={s.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:justify-between gap-4">
                    <div>
                      <h6 className="text-sm font-medium">
                        [{s.terms.join(', ')}] {s.is_one_way ? '→' : '↔'} [{s.replacements.join(', ')}]
                      </h6>
                      <div className="flex flex-row gap-2 mt-2 items-center">
                        <Badge variant={STATUS_COLORS[s.status]}>{s.status}</Badge>
                        <Badge variant="secondary">{s.locale}</Badge>
                        <Badge variant="secondary">
                          {s.indexes.length === 0 ? 'all indexes' : s.indexes.join(', ')}
                        </Badge>
                        <Badge variant="secondary">{s.source}</Badge>
                      </div>
                      {s.notes && (
                        <p className="text-xs text-muted-foreground">{s.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-row gap-2">
                      {s.status === 'pending' && (
                        <Button size="sm" onClick={() => setStatus(s.id, 'active')} disabled={busy === s.id}>
                          Activate
                        </Button>
                      )}
                      {s.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(s.id, 'rejected')} disabled={busy === s.id}>
                          Reject
                        </Button>
                      )}
                      {s.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(s.id, 'pending')} disabled={busy === s.id}>
                          Suspend
                        </Button>
                      )}
                      {s.status !== 'archived' && (
                        <Button size="sm" variant="destructive" onClick={() => archive(s.id)} disabled={busy === s.id}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
