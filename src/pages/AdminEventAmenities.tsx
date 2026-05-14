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

interface EventAmenityRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const columnHelper = createColumnHelper<EventAmenityRow>();

const categories = ['Technology', 'Accessibility', 'Comfort', 'Food & Beverage', 'Services'];

const emptyForm = {
  name: '',
  description: '',
  icon: '',
  category: '',
  is_active: true,
  sort_order: 0,
};

export default function AdminEventAmenities() {
  const queryClient = useQueryClient();
  const crud = useTaxonomyCRUD('event_amenities');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const invalidateTable = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'event_amenities'] });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (row: EventAmenityRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name || '',
      description: row.description || '',
      icon: row.icon || '',
      category: row.category || '',
      is_active: row.is_active,
      sort_order: row.sort_order || 0,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Error: Name is required');
      return;
    }
    try {
      const { error } = await crud.upsert(form, editingId);
      if (error) throw error;
      toast.success(`Success: ${editingId}`);
      if (editingId) {
        const { error } = await crud.upsert(form, editingId);
        if (error) throw error;
        toast.success('Success: Event amenity updated');
      } else {
        const { error } = await crud.upsert(form, null);
        if (error) throw error;
        toast.success('Success: Event amenity created');
      }
      setDialogOpen(false);
      invalidateTable();
    } catch (err: unknown) {
      toast.error(`Error: ${err}`);
    }
  };

  const handleDelete = async (row: EventAmenityRow) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    try {
      const { error } = await crud.remove(row.id);
      if (error) throw error;
      toast.success('Success: Event amenity deleted');
      invalidateTable();
    } catch {
      toast.error('Error: Failed to delete');
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => <span style={{ fontWeight: 500 }}>{info.getValue()}</span>,
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
        cell: (info) => info.getValue(),
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  const tableConfig: AdminTableConfig<EventAmenityRow> = useMemo(
    () => ({
      tableName: 'event_amenities',
      select: 'id,name,description,icon,category,is_active,sort_order,created_at',
      columns,
      defaultSort: { column: 'sort_order', direction: 'asc' },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name'],
      entityFilters: [
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          column: 'category',
          options: categories.map((c) => ({ value: c, label: c })),
        },
        { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
      ],
      bulkEditFields: [{ key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' }],
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
          Add Amenity
        </Button>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDelete is stable in practice, adding would defeat memoization
    [columns],
  );

  return (
    <AdminEntityTable
      title="Event Amenities"
      subtitle="Manage event amenities and features"
      config={tableConfig}
      afterTable={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent style={{ maxWidth: 480 }}>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Amenity' : 'Create Amenity'}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <div>
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
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
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
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
