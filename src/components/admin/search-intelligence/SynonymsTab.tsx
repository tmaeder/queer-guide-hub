import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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

  // create form
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
        terms: terms
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        replacements: replacements
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        locale: locale || '*',
        indexes: indexes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
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
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            New synonym
          </Typography>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems="flex-end"
            sx={{ flexWrap: 'wrap' }}
          >
            <TextField
              label="Terms (comma separated)"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              sx={{ minWidth: 240 }}
              fullWidth
            />
            <TextField
              label="Replacements (comma separated)"
              value={replacements}
              onChange={(e) => setReplacements(e.target.value)}
              sx={{ minWidth: 240 }}
              fullWidth
            />
            <TextField
              label="Locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              sx={{ width: 100 }}
            />
            <TextField
              label="Indexes (blank = all)"
              value={indexes}
              onChange={(e) => setIndexes(e.target.value)}
              sx={{ minWidth: 200 }}
            />
            <FormControlLabel
              control={<Switch checked={oneWay} onChange={(e) => setOneWay(e.target.checked)} />}
              label="One-way"
            />
            <Button
              onClick={create}
              disabled={busy === 'create' || !terms || !replacements}
            >
              {busy === 'create' ? 'Creating…' : 'Create (pending)'}
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            New synonyms start in <code>pending</code>. They reach Meilisearch only after an admin
            sets them to <code>active</code>.
          </Typography>
        </CardContent>
      </Card>

      <Box>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6">Synonyms</Typography>
          <TextField
            select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
            <MenuItem value="archived">Archived</MenuItem>
          </TextField>
        </Stack>
        {error && <Typography color="error">{error}</Typography>}
        {loading ? (
          <Typography>Loading…</Typography>
        ) : items.length === 0 ? (
          <Typography color="text.secondary">No synonyms.</Typography>
        ) : (
          <Stack spacing={1}>
            {items.map((s) => (
              <Card key={s.id}>
                <CardContent>
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    justifyContent="space-between"
                    spacing={2}
                  >
                    <Box>
                      <Typography variant="subtitle2">
                        [{s.terms.join(', ')}] {s.is_one_way ? '→' : '↔'} [
                        {s.replacements.join(', ')}]
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
                        <Badge variant={STATUS_COLORS[s.status]}>{s.status}</Badge>
                        <Badge variant="secondary">{s.locale}</Badge>
                        <Badge variant="secondary">
                          {s.indexes.length === 0 ? 'all indexes' : s.indexes.join(', ')}
                        </Badge>
                        <Badge variant="secondary">{s.source}</Badge>
                      </Stack>
                      {s.notes && (
                        <Typography variant="caption" color="text.secondary">
                          {s.notes}
                        </Typography>
                      )}
                    </Box>
                    <Stack direction="row" spacing={1}>
                      {s.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => setStatus(s.id, 'active')}
                          disabled={busy === s.id}
                        >
                          Activate
                        </Button>
                      )}
                      {s.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus(s.id, 'rejected')}
                          disabled={busy === s.id}
                        >
                          Reject
                        </Button>
                      )}
                      {s.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus(s.id, 'pending')}
                          disabled={busy === s.id}
                        >
                          Suspend
                        </Button>
                      )}
                      {s.status !== 'archived' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => archive(s.id)}
                          disabled={busy === s.id}
                        >
                          Archive
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
