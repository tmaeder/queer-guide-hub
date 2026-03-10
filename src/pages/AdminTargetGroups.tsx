import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { api } from '@/integrations/api/client';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TargetGroupRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

const columnHelper = createColumnHelper<TargetGroupRow>();

const emptyForm = {
  name: '',
  description: '',
  icon: '',
  color: '#6366f1',
  sort_order: 0,
  is_active: true,
};

export default function AdminTargetGroups() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const invalidateTable = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'target_groups'] });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (row: TargetGroupRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name || '',
      description: row.description || '',
      icon: row.icon || '',
      color: row.color || '#6366f1',
      sort_order: row.sort_order || 0,
      is_active: row.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    try {
      if (editingId) {
        const { error } = await api.from('target_groups').update(form).eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Success', description: 'Target group updated' });
      } else {
        const { error } = await api.from('target_groups').insert([form]);
        if (error) throw error;
        toast({ title: 'Success', description: 'Target group created' });
      }
      setDialogOpen(false);
      invalidateTable();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to save',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (row: TargetGroupRow) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    try {
      const { error } = await api.from('target_groups').delete().eq('id', row.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Target group deleted' });
      invalidateTable();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0 }}
              style={{ backgroundColor: info.row.original.color }}
            />
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
          </Box>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        cell: (info) => (
          <span
            style={{
              maxWidth: 300,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {info.getValue() || '-'}
          </span>
        ),
        meta: { hideable: true } satisfies AdminColumnMeta,
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
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  const tableConfig: AdminTableConfig<TargetGroupRow> = useMemo(
    () => ({
      tableName: 'target_groups',
      select: 'id,name,description,icon,color,sort_order,is_active,created_at',
      columns,
      defaultSort: { column: 'sort_order', direction: 'asc' },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name'],
      entityFilters: [{ key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' }],
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
          Add Target Group
        </Button>
      ),
    }),
    [columns],
  );

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Target Groups
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage LGBTQ+ community target groups
        </Typography>
      </Box>

      <AdminDataTable config={tableConfig} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Target Group' : 'Create Target Group'}</DialogTitle>
          </DialogHeader>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Box>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Box>
            <Box>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <Box>
                <Label>Icon</Label>
                <Input
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  placeholder="Lucide name"
                />
              </Box>
              <Box>
                <Label>Color</Label>
                <Input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                />
              </Box>
              <Box>
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))
                  }
                />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                checked={form.is_active}
                onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: c }))}
              />
              <Label>Active</Label>
            </Box>
          </Box>
          <DialogFooter style={{ marginTop: 16 }}>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editingId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
