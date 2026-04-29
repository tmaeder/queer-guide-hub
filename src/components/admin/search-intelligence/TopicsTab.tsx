import { useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Alert from '@mui/material/Alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { callSearchIntelligence } from '@/hooks/useSearchIntelligence';

interface Cluster {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_cluster_id: string | null;
  is_featured: boolean;
  status: 'draft' | 'active' | 'archived';
  starts_at: string | null;
  ends_at: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  tag_count: number;
  created_at: string;
  updated_at: string;
}

const STATUS_VARIANT: Record<Cluster['status'], 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  active: 'default',
  archived: 'destructive',
};

export function TopicsTab() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await callSearchIntelligence<Cluster[]>('clusters', {
      searchParams: { status: statusFilter || undefined, limit: '200' },
    });
    if (!res.success) setError(res.error);
    else {
      setClusters(res.data);
      setError(null);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!slug || !name) {
      setError('Slug and name are required');
      return;
    }
    setBusy('create');
    const res = await callSearchIntelligence<Cluster>('clusters', {
      method: 'POST',
      body: { slug, name, description: description || null, is_featured: isFeatured },
    });
    if (!res.success) setError(res.error);
    else {
      setSlug('');
      setName('');
      setDescription('');
      setIsFeatured(false);
      await refresh();
    }
    setBusy(null);
  };

  const archive = async (id: string) => {
    if (!confirm('Archive this cluster? It stops appearing in storefront facets.')) return;
    setBusy(id);
    const res = await callSearchIntelligence(`clusters/${id}`, { method: 'DELETE' });
    if (!res.success) setError(res.error);
    await refresh();
    setBusy(null);
  };

  const setStatus = async (id: string, status: Cluster['status']) => {
    setBusy(id);
    const res = await callSearchIntelligence(`clusters/${id}`, {
      method: 'PATCH',
      body: { status },
    });
    if (!res.success) setError(res.error);
    await refresh();
    setBusy(null);
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            New topic cluster
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Editorial bundles that group multiple unified_tags. Surfaced as facets and hub pages.
            Add tags via the cluster detail view (coming next).
          </Typography>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ mt: 2, flexWrap: 'wrap' }}
          >
            <TextField
              label="Slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              sx={{ minWidth: 180 }}
              placeholder="pride-europe-2026"
              required
            />
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              sx={{ minWidth: 220 }}
              required
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              maxRows={3}
            />
            <FormControlLabel
              control={
                <Switch checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
              }
              label="Featured"
            />
            <Button onClick={create} disabled={busy === 'create' || !slug || !name}>
              {busy === 'create' ? 'Creating…' : 'Create'}
            </Button>
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Box>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <Typography variant="h6">Topic clusters</Typography>
          <TextField
            select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="archived">Archived</MenuItem>
          </TextField>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        </Stack>
        {loading ? (
          <Typography>Loading…</Typography>
        ) : clusters.length === 0 ? (
          <Typography color="text.secondary">No clusters yet.</Typography>
        ) : (
          <Stack spacing={1}>
            {clusters.map((c) => (
              <Card key={c.id}>
                <CardContent>
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    justifyContent="space-between"
                    spacing={2}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="subtitle2">{c.name}</Typography>
                        <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                        {c.is_featured && <Badge variant="default">featured</Badge>}
                      </Stack>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: 'monospace' }}
                      >
                        {c.slug}
                      </Typography>
                      {c.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {c.description}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        {c.tag_count} tag(s) · created {new Date(c.created_at).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      {c.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => setStatus(c.id, 'active')}
                          disabled={busy === c.id}
                        >
                          Publish
                        </Button>
                      )}
                      {c.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus(c.id, 'draft')}
                          disabled={busy === c.id}
                        >
                          Unpublish
                        </Button>
                      )}
                      {c.status !== 'archived' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => archive(c.id)}
                          disabled={busy === c.id}
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
