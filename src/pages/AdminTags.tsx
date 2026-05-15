import React, { useState, useMemo } from 'react';
import { useCentralizedTags } from '@/hooks/useCentralizedTags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { TagCategorizer } from '@/components/admin/TagCategorizer';
import { TagsCsvImport } from '@/components/admin/TagsCsvImport';
import TagMergeCandidates from '@/components/admin/TagMergeCandidates';
import { TagImageUpload } from '@/components/admin/TagImageUpload';
import BulkCreateAITags from '@/components/admin/BulkCreateAITags';
import BatchAutoTagDialog from '@/components/admin/BatchAutoTagDialog';
import { TagAliasesSection } from '@/components/admin/TagAliasesSection';
import { normalizeTagName } from '@/utils/tagNormalization';
import BatchGeoLinkDialog from '@/components/admin/BatchGeoLinkDialog';
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';

interface TagRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  usage_count: number;
  status: string;
  image_url: string | null;
  deprecation_reason: string | null;
  created_at: string;
}

const columnHelper = createColumnHelper<TagRow>();

export default function AdminTags() {
  const { categoriesTree, createTag, updateTag, deleteTag, allTags: tags } = useCentralizedTags();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagRow | null>(null);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditTags, setBulkEditTags] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    description: '',
    image_url: '' as string | null,
  });

  const resetForm = () => {
    setFormData({ name: '', category: '', description: '', image_url: null });
    setEditingTag(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanData = {
        name: normalizeTagName(formData.name),
        category: formData.category?.trim() || null,
        description: formData.description?.trim() || null,
        image_url: formData.image_url || null,
      };
      if (editingTag) {
        await updateTag(editingTag.id, cleanData);
        toast.success('Success: Tag updated successfully');
      } else {
        await createTag({
          ...cleanData,
          slug: cleanData.name
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, ''),
        });
        toast.success('Success: Tag created successfully');
      }
      resetForm();
      setIsCreateDialogOpen(false);
    } catch {
      toast.error('Error: Failed to save tag');
    }
  };

  const handleEdit = (tag: TagRow) => {
    setFormData({
      name: tag.name,
      category: tag.category,
      description: tag.description || '',
      image_url: tag.image_url || null,
    });
    setEditingTag(tag);
    setIsCreateDialogOpen(true);
  };

  const handleDelete = async (tag: TagRow) => {
    if (confirm(`Delete tag "${tag.name}"?`)) {
      try {
        await deleteTag(tag.id);
        toast.success('Success: Tag deleted');
      } catch {
        toast.error('Error: Failed to delete tag');
      }
    }
  };

  const handleBulkEditDescriptions = () => {
    const withoutDesc = tags.filter((t) => !t.description?.trim());
    const initial: Record<string, string> = {};
    withoutDesc.forEach((t) => {
      initial[t.id] = `${t.name} related to ${t.category}`;
    });
    setBulkEditTags(initial);
    setIsBulkEditOpen(true);
  };

  const saveBulkDescriptions = async () => {
    try {
      await Promise.all(
        Object.entries(bulkEditTags).map(([id, description]) => updateTag(id, { description })),
      );
      toast({ title: 'Success', description: `Updated ${Object.keys(bulkEditTags).length} tags` });
      setIsBulkEditOpen(false);
      setBulkEditTags({});
    } catch {
      toast.error('Error: Failed to update descriptions');
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('image_url', {
        header: 'Image',
        cell: (info) => {
          const url = info.getValue();
          if (!url) return <ImageOff className="h-4 w-4 text-muted-foreground opacity-40" />;
          return (
            <img
              src={url}
              alt=""
              className="h-8 w-8 rounded object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          );
        },
        meta: {
          defaultVisible: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => <span style={{ fontWeight: 500 }}>{info.getValue()}</span>,
        meta: {
          serverSortable: true,
          defaultVisible: true,
          hideable: false,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('slug', {
        header: 'Slug',
        cell: (info) => (
          <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span>
        ),
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
        meta: {
          serverSortable: true,
          serverFilterable: true,
          groupable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const s = info.getValue();
          const color = s === 'active' ? '#dcfce7' : s === 'deprecated' ? '#fef3c7' : '#e2e8f0';
          const text = s === 'active' ? '#166534' : s === 'deprecated' ? '#92400e' : '#475569';
          return <Badge style={{ backgroundColor: color, color: text }}>{s}</Badge>;
        },
        meta: {
          serverSortable: true,
          serverFilterable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('usage_count', {
        header: 'Usage',
        cell: (info) => info.getValue()?.toLocaleString() ?? 0,
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        cell: (info) => {
          const desc = info.getValue();
          if (!desc)
            return <span className="text-sm text-muted-foreground">-</span>;
          return (
            <span className="text-sm max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap block">
              {desc}
            </span>
          );
        },
        meta: { defaultVisible: false, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('created_at', {
        header: 'Created',
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  const tableConfig: AdminTableConfig<TagRow> = useMemo(
    () => ({
      tableName: 'unified_tags',
      select:
        'id,name,slug,category,description,usage_count,status,image_url,deprecation_reason,created_at',
      columns,
      defaultSort: { column: 'name', direction: 'asc' },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name', 'description', 'slug'],
      entityFilters: [
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          column: 'category',
          options: 'dynamic',
          dynamicSource: { table: 'tag_categories', column: 'name' },
        },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          column: 'status',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'deprecated', label: 'Deprecated' },
            { value: 'merged', label: 'Merged' },
          ],
        },
        {
          key: 'has_image',
          label: 'Has Image',
          type: 'select',
          column: 'image_url',
          options: [
            { value: 'not.is.null', label: 'With image' },
            { value: 'is.null', label: 'Without image' },
          ],
        },
      ],
      bulkEditFields: [
        { key: 'category', label: 'Category', type: 'text', column: 'category' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          column: 'status',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'deprecated', label: 'Deprecated' },
            { value: 'merged', label: 'Merged' },
          ],
        },
      ],
      rowActions: [
        { key: 'edit', label: 'Edit', icon: Edit, onClick: handleEdit },
        {
          key: 'clear-image',
          label: 'Clear Image',
          icon: ImageOff,
          onClick: async (tag: TagRow) => {
            if (!tag.image_url) return;
            try {
              await updateTag(tag.id, { image_url: null });
              toast({ title: 'Image cleared', description: `Removed image from "${tag.name}"` });
            } catch {
              toast.error('Error: Failed to clear image');
            }
          },
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          onClick: handleDelete,
          variant: 'destructive',
        },
      ],
      toolbarActions: (
        <div className="flex gap-1 flex-wrap">
          <TagsCsvImport onImportComplete={() => window.location.reload()} />
          <ExportExcelButton
            onExport={async () => {
              const cols: ExportColumnDef<Record<string, unknown>>[] = [
                { header: 'Name', accessor: (r) => r.name },
                { header: 'Slug', accessor: (r) => r.slug },
                { header: 'Category', accessor: (r) => r.category },
                { header: 'Status', accessor: (r) => r.status },
                { header: 'Description', accessor: (r) => r.description },
                { header: 'Usage Count', accessor: (r) => r.usage_count },
                { header: 'Deprecation Reason', accessor: (r) => r.deprecation_reason },
                { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
              ];
              const allData = await fetchAllRows('unified_tags', '*', {
                column: 'name',
                ascending: true,
              });
              await exportToExcel(allData, cols, generateFilename('tags'));
            }}
          />
          <BulkCreateAITags onComplete={() => window.location.reload()} />
          <BatchAutoTagDialog onComplete={() => window.location.reload()} />
          <BatchGeoLinkDialog onComplete={() => window.location.reload()} />
          <Button variant="outline" size="sm" onClick={handleBulkEditDescriptions}>
            <Edit className="h-3.5 w-3.5 mr-1" />
            Bulk Descriptions
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={resetForm}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Create
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingTag ? 'Edit Tag' : 'Create New Tag'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="name">Tag Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) => setFormData((p) => ({ ...p, category: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriesTree.map((cat) => (
                        <React.Fragment key={cat.id}>
                          <SelectItem value={cat.name}>{cat.name}</SelectItem>
                          {cat.children.map((child) => (
                            <SelectItem key={child.id} value={child.name}>
                              <span style={{ paddingLeft: 16, fontSize: '0.9em' }}>
                                ↳ {child.name}
                              </span>
                            </SelectItem>
                          ))}
                        </React.Fragment>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                <TagImageUpload
                  currentImageUrl={formData.image_url}
                  onImageChange={(url) => setFormData((p) => ({ ...p, image_url: url }))}
                  tagName={formData.name}
                />
                {editingTag && <TagAliasesSection tagId={editingTag.id} />}
                <Button type="submit" className="w-full">
                  {editingTag ? 'Update Tag' : 'Create Tag'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers are stable, adding would defeat memoization
    [columns, categoriesTree, isCreateDialogOpen, editingTag, formData],
  );

  return (
    <AdminEntityTable
      title="Tags Management"
      subtitle="Create and manage content tags"
      config={tableConfig}
      beforeTable={
        <>
          <div className="mb-6">
            <TagCategorizer />
          </div>
          <TagMergeCandidates />
        </>
      }
      afterTable={
        <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bulk Edit Tag Descriptions</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Add descriptions to tags that don't have them.
              </p>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {Object.entries(bulkEditTags).map(([tagId, description]) => {
                const tag = tags.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <div key={tagId} className="border border-border rounded-element p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">{tag.name}</span>
                      <Badge variant="outline">{tag.category}</Badge>
                    </div>
                    <Textarea
                      value={description}
                      onChange={(e) =>
                        setBulkEditTags((p) => ({ ...p, [tagId]: e.target.value }))
                      }
                      placeholder="Enter description..."
                      rows={2}
                    />
                  </div>
                );
              })}
              {Object.keys(bulkEditTags).length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">All tags have descriptions!</p>
                </div>
              )}
              {Object.keys(bulkEditTags).length > 0 && (
                <div className="flex gap-2 pt-4">
                  <Button onClick={saveBulkDescriptions} className="flex-1">
                    Save All ({Object.keys(bulkEditTags).length} tags)
                  </Button>
                  <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      }
    />
  );
}
