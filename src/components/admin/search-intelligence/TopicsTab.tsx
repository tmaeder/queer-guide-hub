import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { callSearchIntelligence } from '@/hooks/useSearchIntelligence';
import { ClusterTagPicker } from './ClusterTagPicker';

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="pt-6">
          <h6 className="text-lg font-medium mb-1">New topic cluster</h6>
          <p className="text-sm text-muted-foreground mb-4">
            Editorial bundles that group multiple unified_tags. Surfaced as facets and hub pages.
            Add tags via the cluster detail view (coming next).
          </p>
          <div className="flex flex-col md:flex-row gap-4 flex-wrap">
            <div className="flex flex-col gap-2 min-w-[180px]">
              <Label htmlFor="t-slug">Slug *</Label>
              <Input id="t-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="pride-europe-2026" />
            </div>
            <div className="flex flex-col gap-2 min-w-[220px]">
              <Label htmlFor="t-name">Name *</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
              <Label htmlFor="t-desc">Description</Label>
              <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="t-feat" checked={isFeatured} onCheckedChange={setIsFeatured} />
              <Label htmlFor="t-feat">Featured</Label>
            </div>
            <Button onClick={create} disabled={busy === 'create' || !slug || !name}>
              {busy === 'create' ? 'Creating…' : 'Create'}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="flex flex-row items-center gap-4 mb-4">
          <h6 className="text-lg font-medium">Topic clusters</h6>
          <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="min-w-[140px] h-9 w-auto"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        </div>
        {loading ? (
          <p>Loading…</p>
        ) : clusters.length === 0 ? (
          <p className="text-muted-foreground">No clusters yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {clusters.map((c) => (
              <Card key={c.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-row items-center gap-2">
                        <h6 className="text-sm font-medium">{c.name}</h6>
                        <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                        {c.is_featured && <Badge variant="default">featured</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{c.slug}</p>
                      {c.description && (
                        <p className="text-sm text-muted-foreground mt-1">{c.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {c.tag_count} tag(s) · created {new Date(c.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-row gap-2 items-start">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                      >
                        {expandedId === c.id ? 'Hide tags' : 'Manage tags'}
                      </Button>
                      {c.status === 'draft' && (
                        <Button size="sm" onClick={() => setStatus(c.id, 'active')} disabled={busy === c.id}>
                          Publish
                        </Button>
                      )}
                      {c.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(c.id, 'draft')} disabled={busy === c.id}>
                          Unpublish
                        </Button>
                      )}
                      {c.status !== 'archived' && (
                        <Button size="sm" variant="destructive" onClick={() => archive(c.id)} disabled={busy === c.id}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </div>
                  {expandedId === c.id && (
                    <ClusterTagPicker clusterId={c.id} onChange={refresh} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
