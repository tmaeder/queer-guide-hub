import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useAuth } from '@/hooks/useAuth';
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
import { Plus, Edit, Trash2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import BatchGeoLinkDialog from '@/components/admin/BatchGeoLinkDialog';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { categoriesTree, createTag, updateTag, deleteTag, allTags: tags } = useCentralizedTags();
  const { toast } = useToast();

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
        name: formData.name.trim(),
        category: formData.category?.trim() || null,
        description: formData.description?.trim() || null,
        image_url: formData.image_url || null,
      };
      if (editingTag) {
        await updateTag(editingTag.id, cleanData);
        toast({ title: 'Success', description: 'Tag updated successfully' });
      } else {
        await createTag({
          ...cleanData,
          slug: cleanData.name
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, ''),
        });
        toast({ title: 'Success', description: 'Tag created successfully' });
      }
      resetForm();
      setIsCreateDialogOpen(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to save tag', variant: 'destructive' });
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
        toast({ title: 'Success', description: 'Tag deleted' });
      } catch {
        toast({ title: 'Error', description: 'Failed to delete tag', variant: 'destructive' });
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
      toast({
        title: 'Error',
        description: 'Failed to update descriptions',
        variant: 'destructive',
      });
    }
  };

  // Column definitions
  const columns = useMemo(
    () => [
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
          <Typography
            variant="body2"
            sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}
          >
            {info.getValue()}
          </Typography>
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
            return (
              <Typography variant="body2" color="text.secondary">
                -
              </Typography>
            );
          return (
            <Typography
              variant="body2"
              sx={{
                maxWidth: 300,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {desc}
            </Typography>
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
      ],
      bulkEditFields: [
        {
          key: 'category',
          label: 'Category',
          type: 'text',
          column: 'category',
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
      ],
      rowActions: [
        { key: 'edit', label: 'Edit', icon: Edit, onClick: handleEdit },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          onClick: handleDelete,
          variant: 'destructive',
        },
      ],
      toolbarActions: (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
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
            <Edit style={{ height: 14, width: 14, marginRight: 4 }} />
            Bulk Descriptions
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={resetForm}>
                <Plus style={{ height: 14, width: 14, marginRight: 4 }} />
                Create
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingTag ? 'Edit Tag' : 'Create New Tag'}</DialogTitle>
              </DialogHeader>
              <Box
                component="form"
                onSubmit={handleSubmit}
                sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                <Box>
                  <Label htmlFor="name">Tag Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </Box>
                <Box>
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
                </Box>
                <Box>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                  />
                </Box>
                <TagImageUpload
                  currentImageUrl={formData.image_url}
                  onImageChange={(url) => setFormData((p) => ({ ...p, image_url: url }))}
                  tagName={formData.name}
                />
                {editingTag && <TagAliasesSection tagId={editingTag.id} />}
                <Button type="submit" style={{ width: '100%' }}>
                  {editingTag ? 'Update Tag' : 'Create Tag'}
                </Button>
              </Box>
            </DialogContent>
          </Dialog>
        </Box>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers are stable, adding would defeat memoization
    [columns, categoriesTree, isCreateDialogOpen, editingTag, formData],
  );

  if (!user) {
    navigate('/auth');
    return null;
  }
  if (rolesLoading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }
  if (!canManageContent()) {
    navigate('/');
    return null;
  }

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button variant="outline" onClick={() => navigate('/admin')}>
          <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
          Back
        </Button>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Tags Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create and manage content tags
          </Typography>
        </Box>
      </Box>

      {/* Tag Categorizer */}
      <Box sx={{ mb: 3 }}>
        <TagCategorizer />
      </Box>

      {/* Near-duplicate tag merge (find_unified_tag_duplicates + merge_unified_tag) */}
      <TagMergeCandidates />

      {/* Data Table */}
      <AdminDataTable config={tableConfig} />

      {/* Bulk Edit Descriptions Dialog */}
      <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
        <DialogContent style={{ maxWidth: 896, maxHeight: '80vh', overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle>Bulk Edit Tag Descriptions</DialogTitle>
            <Typography variant="body2" color="text.secondary">
              Add descriptions to tags that don't have them.
            </Typography>
          </DialogHeader>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Object.entries(bulkEditTags).map(([tagId, description]) => {
              const tag = tags.find((t) => t.id === tagId);
              if (!tag) return null;
              return (
                <Box key={tagId} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <span style={{ fontWeight: 500 }}>{tag.name}</span>
                    <Badge variant="outline">{tag.category}</Badge>
                  </Box>
                  <Textarea
                    value={description}
                    onChange={(e) => setBulkEditTags((p) => ({ ...p, [tagId]: e.target.value }))}
                    placeholder="Enter description..."
                    rows={2}
                  />
                </Box>
              );
            })}
            {Object.keys(bulkEditTags).length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  All tags have descriptions!
                </Typography>
              </Box>
            )}
            {Object.keys(bulkEditTags).length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, pt: 2 }}>
                <Button onClick={saveBulkDescriptions} style={{ flex: 1 }}>
                  Save All ({Object.keys(bulkEditTags).length} tags)
                </Button>
                <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>
                  Cancel
                </Button>
              </Box>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
