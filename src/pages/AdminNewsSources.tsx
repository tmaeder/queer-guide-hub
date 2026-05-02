import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus,
  Edit,
  Trash2,
  ExternalLink,
  RefreshCw,
  Globe,
  Rss,
  AlertCircle,
  CheckCircle,
  Tags,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { LEGACY_NEWS_TRIGGER_ENABLED } from '@/lib/featureFlags';

interface NewsSourceRow {
  id: string;
  name: string;
  url: string;
  source_type: string;
  category: string;
  is_active: boolean;
  fetch_frequency: number;
  status: string | null;
  last_error: string | null;
  articles_fetched: number | null;
  keywords: string[] | null;
  created_at: string;
  updated_at: string;
  last_fetched_at: string | null;
}

const categories = [
  'general',
  'rights',
  'politics',
  'health',
  'community',
  'business',
  'sports',
  'entertainment',
  'technology',
];

const frequencies = [
  { value: 1, label: 'Every Hour' },
  { value: 24, label: 'Daily' },
  { value: 168, label: 'Weekly' },
  { value: 0, label: 'Manual Only' },
];

const columnHelper = createColumnHelper<NewsSourceRow>();

export default function AdminNewsSources() {
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [keywordsDialogOpen, setKeywordsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<NewsSourceRow | null>(null);
  const [editingKeywords, setEditingKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    source_type: 'rss' as 'rss' | 'api',
    category: 'general',
    is_active: true,
    fetch_frequency: 24,
  });

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      source_type: 'rss',
      category: 'general',
      is_active: true,
      fetch_frequency: 24,
    });
    setEditingSource(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSource) {
        const { error } = await supabase
          .from('news_sources')
          .update(formData)
          .eq('id', editingSource.id);
        if (error) throw error;
        toast({ title: 'Success', description: 'News source updated' });
      } else {
        const { error } = await supabase.from('news_sources').insert([formData]);
        if (error) throw error;
        toast({ title: 'Success', description: 'News source created' });
      }
      setDialogOpen(false);
      resetForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to save news source', variant: 'destructive' });
    }
  };

  const handleEdit = (source: NewsSourceRow) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      url: source.url,
      source_type: source.source_type as 'rss' | 'api',
      category: source.category,
      is_active: source.is_active,
      fetch_frequency: source.fetch_frequency,
    });
    setDialogOpen(true);
  };

  const triggerFetch = async (source: NewsSourceRow) => {
    try {
      const { error } = await supabase.functions.invoke('fetch-news', {
        body: { sourceId: source.id },
      });
      if (error) throw error;
      toast({ title: 'Success', description: `Fetch triggered for ${source.name}` });
    } catch {
      toast({
        title: 'Error',
        description: `Failed to fetch news for ${source.name}`,
        variant: 'destructive',
      });
    }
  };

  const handleKeywordsEdit = (source: NewsSourceRow) => {
    setEditingSource(source);
    setEditingKeywords(source.keywords || []);
    setKeywordsDialogOpen(true);
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !editingKeywords.includes(newKeyword.trim())) {
      setEditingKeywords([...editingKeywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setEditingKeywords(editingKeywords.filter((k) => k !== keyword));
  };

  const saveKeywords = async () => {
    if (!editingSource) return;
    try {
      const { error } = await supabase
        .from('news_sources')
        .update({ keywords: editingKeywords })
        .eq('id', editingSource.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Keywords updated' });
      setKeywordsDialogOpen(false);
      setEditingSource(null);
      setEditingKeywords([]);
    } catch {
      toast({ title: 'Error', description: 'Failed to update keywords', variant: 'destructive' });
    }
  };

  // --- Columns ---
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <Box>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontSize: '0.75rem',
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {info.row.original.url}
            </Typography>
          </Box>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('source_type', {
        header: 'Type',
        cell: (info) => {
          const val = info.getValue();
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {val === 'rss' ? (
                <Rss style={{ height: 14, width: 14 }} />
              ) : (
                <Globe style={{ height: 14, width: 14 }} />
              )}
              <Badge variant="secondary">{val.toUpperCase()}</Badge>
            </Box>
          );
        },
        meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
        meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('is_active', {
        header: 'Status',
        cell: (info) => {
          const row = info.row.original;
          const active = info.getValue();
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {row.status === 'error' ? (
                <AlertCircle style={{ height: 14, width: 14, color: '#ef4444' }} />
              ) : (
                <CheckCircle
                  style={{ height: 14, width: 14, color: active ? '#22c55e' : '#94a3b8' }}
                />
              )}
              <Badge
                variant={!active ? 'secondary' : row.status === 'error' ? 'destructive' : 'default'}
              >
                {active ? row.status || 'Active' : 'Inactive'}
              </Badge>
            </Box>
          );
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('articles_fetched', {
        header: 'Articles',
        cell: (info) => info.getValue() ?? 0,
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('last_fetched_at', {
        header: 'Last Fetched',
        cell: (info) => {
          const val = info.getValue();
          if (!val) return 'Never';
          const d = new Date(val);
          const diff = Date.now() - d.getTime();
          const hours = Math.floor(diff / 3600000);
          if (hours < 1) return 'Just now';
          if (hours < 24) return `${hours}h ago`;
          return `${Math.floor(hours / 24)}d ago`;
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  // --- Table config ---
  const tableConfig: AdminTableConfig<NewsSourceRow> = useMemo(
    () => ({
      tableName: 'news_sources',
      select:
        'id,name,url,source_type,category,is_active,fetch_frequency,status,last_error,articles_fetched,keywords,created_at,updated_at,last_fetched_at',
      columns,
      defaultSort: { column: 'created_at', direction: 'desc' as const },
      defaultPageSize: 25,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name', 'url'],
      entityFilters: [
        {
          key: 'source_type',
          label: 'Type',
          type: 'select',
          column: 'source_type',
          options: [
            { value: 'rss', label: 'RSS' },
            { value: 'api', label: 'API' },
          ],
        },
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          column: 'category',
          options: categories.map((c) => ({
            value: c,
            label: c.charAt(0).toUpperCase() + c.slice(1),
          })),
        },
        { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
      ],
      bulkEditFields: [
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          column: 'category',
          options: categories.map((c) => ({
            value: c,
            label: c.charAt(0).toUpperCase() + c.slice(1),
          })),
        },
        { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
      ],
      rowActions: [
        { key: 'edit', label: 'Edit', icon: Edit, onClick: handleEdit },
        {
          key: 'fetch',
          label: 'Fetch Now (legacy)',
          icon: RefreshCw,
          onClick: triggerFetch,
          visible: () => LEGACY_NEWS_TRIGGER_ENABLED,
        },
        {
          key: 'open',
          label: 'Open URL',
          icon: ExternalLink,
          onClick: (row) => window.open(row.url, '_blank'),
        },
        {
          key: 'keywords',
          label: 'Keywords',
          icon: Tags,
          onClick: handleKeywordsEdit,
          visible: (row) => row.source_type === 'api',
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          variant: 'destructive' as const,
          onClick: async (row) => {
            if (!confirm(`Delete "${row.name}"?`)) return;
            try {
              const { error } = await supabase.from('news_sources').delete().eq('id', row.id);
              if (error) throw error;
              toast({ title: 'Success', description: 'Source deleted' });
            } catch {
              toast({
                title: 'Error',
                description: 'Failed to delete source',
                variant: 'destructive',
              });
            }
          },
        },
      ],
      toolbarActions: (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <ExportExcelButton
            onExport={async () => {
              const cols: ExportColumnDef<Record<string, unknown>>[] = [
                { header: 'Name', accessor: (r) => r.name },
                { header: 'URL', accessor: (r) => r.url },
                { header: 'Source Type', accessor: (r) => r.source_type },
                { header: 'Category', accessor: (r) => r.category },
                { header: 'Active', accessor: (r) => formatBoolean(r.is_active) },
                { header: 'Fetch Frequency (hrs)', accessor: (r) => r.fetch_frequency },
                { header: 'Last Fetched', accessor: (r) => formatDateTime(r.last_fetched_at) },
                { header: 'Last Error', accessor: (r) => r.last_error },
                { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
              ];
              const allData = await fetchAllRows('news_sources', '*', {
                column: 'name',
                ascending: true,
              });
              await exportToExcel(allData, cols, generateFilename('news-sources'));
            }}
          />
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
          >
            <Plus style={{ height: 14, width: 14, marginRight: 4 }} />
            Add Source
          </Button>
        </Box>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast/triggerFetch are stable, adding would defeat memoization
    [columns],
  );

  return (
    <AdminEntityTable
      title="News Sources"
      subtitle="Manage RSS feeds and API sources for the news hub"
      config={tableConfig}
      afterTable={
        <>
      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: 500 }}>
          <DialogHeader>
            <DialogTitle>{editingSource ? 'Edit News Source' : 'Add News Source'}</DialogTitle>
          </DialogHeader>
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <div>
              <Label htmlFor="name">Source Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., LGBTQ+ News Network"
                required
              />
            </div>
            <div>
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com/rss"
                required
              />
            </div>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <div>
                <Label>Source Type</Label>
                <Select
                  value={formData.source_type}
                  onValueChange={(v: 'rss' | 'api') => setFormData({ ...formData, source_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rss">RSS Feed</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Box>
            <div>
              <Label>Fetch Frequency</Label>
              <Select
                value={formData.fetch_frequency.toString()}
                onValueChange={(v) => setFormData({ ...formData, fetch_frequency: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {frequencies.map((f) => (
                    <SelectItem key={f.value} value={f.value.toString()}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(c) => setFormData({ ...formData, is_active: c })}
              />
              <Label htmlFor="is_active">Active</Label>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2 }}>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingSource ? 'Update' : 'Create'}</Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Keywords Dialog */}
      <Dialog open={keywordsDialogOpen} onOpenChange={setKeywordsDialogOpen}>
        <DialogContent style={{ maxWidth: 500 }}>
          <DialogHeader>
            <DialogTitle>Manage Keywords - {editingSource?.name}</DialogTitle>
          </DialogHeader>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>
              <Label>Current Keywords</Label>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                {editingKeywords.map((kw, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {kw}
                    <button
                      onClick={() => removeKeyword(kw)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      x
                    </button>
                  </Badge>
                ))}
              </Box>
            </div>
            <div>
              <Label htmlFor="newKeyword">Add Keyword</Label>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Input
                  id="newKeyword"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Enter keyword..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                />
                <Button type="button" onClick={addKeyword} disabled={!newKeyword.trim()}>
                  Add
                </Button>
              </Box>
            </div>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2 }}>
              <Button type="button" variant="outline" onClick={() => setKeywordsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveKeywords}>Save Keywords</Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
        </>
      }
    />
  );
}
