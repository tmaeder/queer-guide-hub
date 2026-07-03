import { useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTaxonomyCRUD } from '@/hooks/useTaxonomyCRUD';
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import {
  buildEmptyForm,
  rowToForm,
  formToPayload,
  type TaxonomyField,
  type TaxonomyPageConfig,
  type TaxonomyRowBase,
} from './taxonomyConfig';

export type { TaxonomyField, TaxonomyPageConfig, TaxonomyRowBase } from './taxonomyConfig';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { slugify } from '@/lib/slugify';

/**
 * Config-driven admin CRUD page for lookup/taxonomy tables (event types,
 * target groups, venue categories/services, professions, accessibility
 * attributes, event amenities/services). Replaces eight copy-pasted pages —
 * each is now a thin config next to this shared scaffold: useTaxonomyCRUD +
 * AdminEntityTable + a dialog form rendered from the field list.
 */

export function TaxonomyAdminPage<TRow extends TaxonomyRowBase>({
  config,
}: {
  config: TaxonomyPageConfig<TRow>;
}) {
  const queryClient = useQueryClient();
  const crud = useTaxonomyCRUD(config.table);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => buildEmptyForm(config.fields));

  const prefixed = (config.toastStyle ?? 'prefixed') === 'prefixed';
  const ok = (msg: string) => toast.success(prefixed ? `Success: ${msg}` : msg);
  const fail = (msg: string) => toast.error(prefixed ? `Error: ${msg}` : msg);

  const invalidateTable = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-table', config.table] });

  const openCreate = () => {
    setEditingId(null);
    setForm(buildEmptyForm(config.fields));
    setDialogOpen(true);
  };

  const openEdit = (row: TRow) => {
    setEditingId(row.id);
    setForm(rowToForm(config.fields, row as unknown as Record<string, unknown>));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    for (const f of config.fields) {
      if (f.required && !String(form[f.key]).trim()) {
        fail(`${f.label} is required`);
        return;
      }
    }
    try {
      const { error } = await crud.upsert(formToPayload(config.fields, form), editingId);
      if (error) throw error;
      ok(`${config.toastNoun} ${editingId ? 'updated' : 'created'}`);
      setDialogOpen(false);
      invalidateTable();
    } catch (err: unknown) {
      if (prefixed) fail(String(err));
      else fail((err as Error)?.message || 'Failed to save');
    }
  };

  const handleDelete = async (row: TRow) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    try {
      const { error } = await crud.remove(row.id);
      if (error) throw error;
      ok(`${config.toastNoun} deleted`);
      invalidateTable();
    } catch {
      fail('Failed to delete');
    }
  };

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<TRow>();
    const dot = config.nameColumn?.colorDot;
    const showSlug = config.nameColumn?.showSlug;

    const nameText = (row: TRow, value: string) =>
      showSlug ? (
        <div>
          <span className="font-medium">{value}</span>
          <span className="block text-xs text-muted-foreground">{row.slug}</span>
        </div>
      ) : (
        <span className="font-medium">{value}</span>
      );

    const cols: ColumnDef<TRow, string>[] = [
      columnHelper.accessor((row) => row.name, {
        id: 'name',
        header: 'Name',
        cell: (info) =>
          dot ? (
            <div className="flex items-center gap-2">
              <div
                className={`w-4 h-4 ${dot === 'full' ? 'rounded-full' : 'rounded-badge'} flex-shrink-0`}
                style={{
                  backgroundColor: info.row.original.color || 'hsl(var(--muted-foreground))',
                }}
              />
              {nameText(info.row.original, info.getValue())}
            </div>
          ) : (
            nameText(info.row.original, info.getValue())
          ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      ...(config.extraColumns ?? []),
    ];

    if (config.showDescriptionColumn !== false) {
      cols.push(
        columnHelper.accessor((row) => row.description ?? '', {
          id: 'description',
          header: 'Description',
          cell: (info) => (
            <span
              style={{ maxWidth: 300, textOverflow: 'ellipsis' }}
              className="overflow-hidden whitespace-nowrap block"
            >
              {info.getValue() || '-'}
            </span>
          ),
          meta: { hideable: true } satisfies AdminColumnMeta,
        }),
      );
    }

    cols.push(
      columnHelper.accessor((row) => String(row.is_active ?? false), {
        id: 'is_active',
        header: 'Status',
        cell: (info) => (
          <Badge variant={info.row.original.is_active ? 'default' : 'secondary'}>
            {info.row.original.is_active ? 'Active' : 'Inactive'}
          </Badge>
        ),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor((row) => String(row.sort_order ?? 0), {
        id: 'sort_order',
        header: 'Order',
        cell: (info) => info.row.original.sort_order ?? 0,
        meta: {
          serverSortable: true,
          hideable: true,
          ...(config.orderColumnDefaultVisible === false ? { defaultVisible: false } : {}),
        } satisfies AdminColumnMeta,
      }),
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config is a module-level constant per page
  }, []);

  const tableConfig: AdminTableConfig<TRow> = useMemo(
    () => ({
      tableName: config.table,
      select: config.select,
      columns,
      defaultSort: config.defaultSort ?? { column: 'sort_order', direction: 'asc' },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: config.searchColumns ?? ['name'],
      entityFilters: config.entityFilters ?? [
        { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
      ],
      bulkEditFields: config.bulkEditFields ?? [
        { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
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
          <Plus size={16} className="mr-1.5" />
          Add {config.entityLabel}
        </Button>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDelete is stable in practice, adding would defeat memoization
    [columns],
  );

  const setField = (key: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const renderField = (f: TaxonomyField) => {
    switch (f.type) {
      case 'switch':
        return (
          <div key={f.key} className="flex items-center gap-2">
            <Switch
              checked={Boolean(form[f.key])}
              onCheckedChange={(c) => setField(f.key, c)}
            />
            <Label>{f.label}</Label>
          </div>
        );
      case 'textarea':
      case 'aliases':
        return (
          <div key={f.key}>
            <Label>{labelText(f)}</Label>
            <Textarea
              value={String(form[f.key])}
              onChange={(e) => setField(f.key, e.target.value)}
              rows={f.rows ?? (f.type === 'aliases' ? 2 : 3)}
              placeholder={f.placeholder}
            />
          </div>
        );
      case 'select':
        return (
          <div key={f.key}>
            <Label>{labelText(f)}</Label>
            <Select value={String(form[f.key])} onValueChange={(v) => setField(f.key, v)}>
              <SelectTrigger>
                <SelectValue placeholder={f.selectPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 'slug':
        return (
          <div key={f.key}>
            <Label>{labelText(f)}</Label>
            <div className="flex gap-2">
              <Input
                value={String(form[f.key])}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                style={{ height: 40 }}
                className="shrink-0"
                onClick={() => {
                  if (!form.name) return;
                  setField(f.key, slugify(String(form.name)));
                }}
              >
                Gen
              </Button>
            </div>
          </div>
        );
      case 'number':
        return (
          <div key={f.key}>
            <Label>{labelText(f)}</Label>
            <Input
              type="number"
              value={Number(form[f.key])}
              onChange={(e) => setField(f.key, parseInt(e.target.value) || 0)}
            />
          </div>
        );
      case 'color':
        return (
          <div key={f.key}>
            <Label>{labelText(f)}</Label>
            <Input
              type="color"
              value={String(form[f.key])}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          </div>
        );
      default:
        return (
          <div key={f.key}>
            <Label>{labelText(f)}</Label>
            <Input
              value={String(form[f.key])}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={f.placeholder}
            />
          </div>
        );
    }
  };

  const byKey = new Map(config.fields.map((f) => [f.key, f]));
  const layout: (string | string[])[] =
    config.formLayout ?? config.fields.map((f) => f.key);

  return (
    <AdminEntityTable
      title={config.title}
      subtitle={config.subtitle}
      config={tableConfig}
      afterTable={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent style={{ maxWidth: config.dialogMaxWidth ?? 480 }}>
            <DialogHeader>
              <DialogTitle>
                {editingId ? 'Edit' : 'Create'} {config.entityLabel}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              {layout.map((row, i) =>
                Array.isArray(row) ? (
                  <div key={i} className={`grid ${row.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-4`}>
                    {row.map((key) => {
                      const f = byKey.get(key);
                      return f ? renderField(f) : null;
                    })}
                  </div>
                ) : (
                  (() => {
                    const f = byKey.get(row);
                    return f ? renderField(f) : null;
                  })()
                ),
              )}
            </div>
            <DialogFooter className="mt-4">
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

function labelText(f: TaxonomyField): string {
  return f.required ? `${f.label} *` : f.label;
}
