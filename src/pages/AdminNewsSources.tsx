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
import { toast } from 'sonner';
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
import { insertInto, updateRow, deleteRow } from '@/hooks/usePageFetchers';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
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
        const { error } = await updateRow('news_sources', editingSource.id, formData);
        if (error) throw error;
        toast.success('Success: News source updated');
      } else {
        const { error } = await insertInto('news_sources', formData);
        if (error) throw error;
        toast.success('Success: News source created');
      }
      setDialogOpen(false);
      resetForm();
    } catch {
      toast.error('Error: Failed to save news source');
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
      const { error } = await updateRow('news_sources', editingSource.id, {
        keywords: editingKeywords,
      });
      if (error) throw error;
      toast.success('Success: Keywords updated');
      setKeywordsDialogOpen(false);
      setEditingSource(null);
      setEditingKeywords([]);
    } catch {
      toast.error('Error: Failed to update keywords');
    }
  };

  // --- Columns ---
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <div>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            <p className="text-sm text-muted-foreground">
              {info.row.original.url}
            </p>
          </div>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('source_type', {
        header: 'Type',
        cell: (info) => {
          const val = info.getValue();
          return (
            <div className="flex items-center gap-1">
              {val === 'rss' ? (
                <Rss style={{ height: 14, width: 14 }} />
              ) : (
                <Globe style={{ height: 14, width: 14 }} />
              )}
              <Badge variant="secondary">{val.toUpperCase()}</Badge>
            </div>
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
            <div className="flex items-center gap-1">
              {row.status === 'error' ? (
                <AlertCircle style={{ height: 14, width: 14, color: 'hsl(var(--destructive))' }} />
              ) : (
                <CheckCircle
                  style={{ height: 14, width: 14, color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                />
              )}
              <Badge
                variant={!active ? 'secondary' : row.status === 'error' ? 'destructive' : 'default'}
              >
                {active ? row.status || 'Active' : 'Inactive'}
              </Badge>
            </div>
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
              const { error } = await deleteRow('news_sources', row.id);
              if (error) throw error;
              toast.success('Success: Source deleted');
            } catch {
              toast.error('Error: Failed to delete source');
            }
          },
        },
      ],
      toolbarActions: (
        <div className="flex gap-2">
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
        </div>
      ),
    }),
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
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            </div>
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
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(c) => setFormData({ ...formData, is_active: c })}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingSource ? 'Update' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Keywords Dialog */}
      <Dialog open={keywordsDialogOpen} onOpenChange={setKeywordsDialogOpen}>
        <DialogContent style={{ maxWidth: 500 }}>
          <DialogHeader>
            <DialogTitle>Manage Keywords - {editingSource?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label>Current Keywords</Label>
              <div className="flex flex-wrap gap-2 mt-2">
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
              </div>
            </div>
            <div>
              <Label htmlFor="newKeyword">Add Keyword</Label>
              <div className="flex gap-2 mt-2">
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
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setKeywordsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveKeywords}>Save Keywords</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
        </>
      }
    />
  );
}
