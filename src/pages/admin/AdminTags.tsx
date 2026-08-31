import React, { useState, useMemo } from 'react';
import { Link } from 'react-router';
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
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { formatDateTime } from '@/lib/format';
import { TagCategorizer } from '@/components/admin/TagCategorizer';
import { TagQualityPanel } from '@/components/admin/TagQualityPanel';
import { TagVocabularyHealthPanel } from '@/components/admin/TagVocabularyHealthPanel';
import { TagHygienePanel } from '@/components/admin/TagHygienePanel';
import { TagSuggestionsReviewPanel } from '@/components/admin/TagSuggestionsReviewPanel';
import { SensitiveTagReviewPanel } from '@/components/admin/SensitiveTagReviewPanel';
import { TagsCsvImport } from '@/components/admin/TagsCsvImport';
import { TagMergeReviewQueue } from '@/components/admin/TagMergeReviewQueue';
import BulkCreateAITags from '@/components/admin/BulkCreateAITags';
import { TagAliasesSection } from '@/components/admin/TagAliasesSection';
import { TagLegalSourcesSection } from '@/components/admin/TagLegalSourcesSection';
import { normalizeTagName } from '@/utils/tagNormalization';
import BatchGeoLinkDialog from '@/components/admin/BatchGeoLinkDialog';
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import type { AdminTableFeatures } from '@/components/admin/data-table/features';

interface TagRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  usage_count: number;
  status: string;
  deprecation_reason: string | null;
  created_at: string;
}

const columnHelper = createColumnHelper<AdminTableFeatures, TagRow>();

const TAXONOMY_PAGES: Array<{ label: string; route: string }> = [
  { label: 'Venue services', route: '/admin/settings/venue-services' },
  { label: 'Event types', route: '/admin/settings/event-types' },
  { label: 'Event amenities', route: '/admin/settings/event-amenities' },
  { label: 'Event services', route: '/admin/settings/event-services' },
  { label: 'Accessibility attributes', route: '/admin/settings/accessibility' },
  { label: 'Target groups', route: '/admin/settings/target-groups' },
  { label: 'Professions', route: '/admin/settings/professions' },
];

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
  });

  const resetForm = () => {
    setFormData({ name: '', category: '', description: '' });
    setEditingTag(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanData = {
        name: normalizeTagName(formData.name),
        category: formData.category?.trim() || null,
        description: formData.description?.trim() || null,
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
    });
    setEditingTag(tag);
    setIsCreateDialogOpen(true);
  };

  const handleDelete = async (tag: TagRow) => {
    if (
      !confirm(
        `Delete tag "${tag.name}"?\n\nThis only succeeds if the tag is unused. If anything still references it you'll get a breakdown of what — merge it instead.`,
      )
    ) {
      return;
    }
    try {
      await deleteTag(tag.id);
      toast.success('Success: Tag deleted');
    } catch (err) {
      // Surface the RPC's own message. admin_delete_tag refuses with a
      // per-source breakdown ("tag_sources: 3 citation(s) would be destroyed",
      // "venues: 41 row(s) still list this tag by name"), and that breakdown is
      // the entire point — swallowing it into "Failed to delete tag" leaves the
      // admin with no idea why, or that merging is the action they want.
      toast.error(err instanceof Error ? err.message : 'Failed to delete tag', {
        duration: 12_000,
      });
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
      toast.success(`Updated ${Object.keys(bulkEditTags).length} tags`);
      setIsBulkEditOpen(false);
      setBulkEditTags({});
    } catch {
      toast.error('Error: Failed to update descriptions');
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
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
          const color =
            s === 'active'
              ? 'hsl(var(--muted))'
              : s === 'deprecated'
                ? 'hsl(var(--muted))'
                : 'hsl(var(--muted))';
          const text =
            s === 'active'
              ? 'hsl(var(--foreground))'
              : s === 'deprecated'
                ? 'hsl(var(--foreground) / 0.7)'
                : 'hsl(var(--muted-foreground))';
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
          if (!desc) return <span className="text-sm text-muted-foreground">-</span>;
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
      select: 'id,name,slug,category,description,usage_count,status,deprecation_reason,created_at',
      columns,
      defaultSort: { column: 'name', direction: 'asc' },
      defaultPageSize: 50,
      enableSelection: true,
      // The bulk bar issues a raw `DELETE FROM unified_tags WHERE id IN (...)`,
      // which is the same defect the per-row action just stopped doing — it
      // cascades citations, clinical codes and ontology edges away and orphans
      // the denormalised `tags text[]` on 20+ content tables. There is no bulk
      // equivalent of admin_delete_tag's per-tag refusal, and there should not
      // be: the alternative to deleting a used tag is merging it, which is
      // inherently one-at-a-time. Selection stays on for bulk edit and export.
      allowBulkDelete: false,
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
                    {/* The Label above says htmlFor="category"; without this
                      id it pointed at nothing and named nothing. */}
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriesTree.map((cat) => (
                        <React.Fragment key={cat.id}>
                          <SelectItem value={cat.name}>{cat.name}</SelectItem>
                          {cat.children.map((child) => (
                            <SelectItem key={child.id} value={child.name}>
                              <span style={{ fontSize: '0.9em' }} className="pl-4">
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
                {editingTag && <TagAliasesSection tagId={editingTag.id} />}
                {editingTag && <TagLegalSourcesSection tagId={editingTag.id} />}
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
          <div className="mb-6 rounded-element bg-muted p-4">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground mb-2">
              Other taxonomies
            </p>
            <div className="flex flex-wrap gap-2">
              {TAXONOMY_PAGES.map((p) => (
                <Button key={p.route} variant="outline" size="sm" asChild>
                  <Link to={p.route}>{p.label}</Link>
                </Button>
              ))}
            </div>
          </div>
          <TagQualityPanel />
          <TagVocabularyHealthPanel />
          <TagHygienePanel />
          <SensitiveTagReviewPanel />
          <TagSuggestionsReviewPanel />
          <div className="mb-6">
            <TagCategorizer />
          </div>
          <TagMergeReviewQueue />
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
                  <div key={tagId} className="rounded-element bg-muted p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">{tag.name}</span>
                      <Badge variant="outline">{tag.category}</Badge>
                    </div>
                    <Textarea
                      value={description}
                      onChange={(e) => setBulkEditTags((p) => ({ ...p, [tagId]: e.target.value }))}
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
