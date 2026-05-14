import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTaxonomyCRUD } from '@/hooks/useTaxonomyCRUD';
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  created_at: string;
}

const columnHelper = createColumnHelper<ServiceRow>();

const serviceCategories = [
  'general',
  'beauty',
  'business',
  'dining',
  'entertainment',
  'events',
  'fitness',
  'professional',
  'retail',
  'wellness',
];

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  icon: '',
  category: 'general',
  sort_order: 0,
  is_active: true,
};

export default function AdminVenueServices() {
  const queryClient = useQueryClient();
  const crud = useTaxonomyCRUD('venue_services');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const invalidateTable = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'venue_services'] });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (row: ServiceRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name || '',
      slug: row.slug || '',
      description: row.description || '',
      icon: row.icon || '',
      category: row.category || 'general',
      sort_order: row.sort_order || 0,
      is_active: row.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      if (editingId) {
        const { error } = await crud.upsert(form, editingId);
        if (error) throw error;
        toast.success('Service updated');
      } else {
        const { error } = await crud.upsert(form, null);
        if (error) throw error;
        toast.success('Service created');
      }
      setDialogOpen(false);
      invalidateTable();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleDelete = async (row: ServiceRow) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    try {
      const { error } = await crud.remove(row.id);
      if (error) throw error;
      toast.success('Service deleted');
      invalidateTable();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const generateSlug = () => {
    if (!form.name) return;
    setForm((f) => ({
      ...f,
      slug: f.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    }));
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <div>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            <span className="block text-xs text-muted-foreground">
              {info.row.original.slug}
            </span>
          </div>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) =>
          info.getValue() ? <Badge variant="outline">{info.getValue()}</Badge> : '-',
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('is_active', {
        header: 'Status',
        cell: (info) => (
          <Badge variant={info.getValue() ? 'default' : 'secondary'}>
            {info.getValue() ? 'Active' : 'Inactive'}
          </Badge>
        ),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('sort_order', {
        header: 'Order',
        cell: (info) => info.getValue() ?? 0,
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  const tableConfig: AdminTableConfig<ServiceRow> = useMemo(
    () => ({
      tableName: 'venue_services',
      select: 'id,name,slug,description,icon,category,sort_order,is_active,created_at',
      columns,
      defaultSort: { column: 'sort_order', direction: 'asc' },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name', 'slug'],
      entityFilters: [
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          column: 'category',
          options: serviceCategories.map((c) => ({
            value: c,
            label: c.charAt(0).toUpperCase() + c.slice(1),
          })),
        },
        { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
      ],
      bulkEditFields: [
        { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          column: 'category',
          options: serviceCategories.map((c) => ({
            value: c,
            label: c.charAt(0).toUpperCase() + c.slice(1),
          })),
        },
      ],
      rowActions: [
        { key: 'edit', label: 'Edit', icon: Edit, onClick: openEdit },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          variant: 'destructive',
          onClick: handleDelete,
        },
      ],
      toolbarActions: (
        <Button size="sm" onClick={openCreate}>
          <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
          Add Service
        </Button>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDelete is stable in practice, adding would defeat memoization
    [columns],
  );

  return (
    <AdminEntityTable
      title="Venue Services"
      subtitle="Manage venue services and offerings"
      config={tableConfig}
      afterTable={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent style={{ maxWidth: 560 }}>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Service' : 'Create Service'}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Slug</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.slug}
                      onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateSlug}
                      style={{ flexShrink: 0, height: 40 }}
                    >
                      Gen
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Icon</Label>
                  <Input
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                    placeholder="Lucide name"
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c.charAt(0).toUpperCase() + c.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: c }))}
                />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter style={{ marginTop: 16 }}>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>{editingId ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    />
  );
}
