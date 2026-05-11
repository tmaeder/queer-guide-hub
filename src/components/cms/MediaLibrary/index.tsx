import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Trash2, Zap } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useUnifiedMedia, PAGE_SIZE } from '@/hooks/useUnifiedMedia';
import { useMediaMutations } from '@/hooks/useMediaMutations';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { UnifiedMediaItem, ViewMode, SortBy, SortDir, StatusFilter, EntityTypeFilter } from './types';
import { MediaToolbar } from './MediaToolbar';
import { MediaGrid } from './MediaGrid';
import { MediaUploadZone } from './MediaUploadZone';
import { DuplicateFinderPanel } from './DuplicateFinderPanel';
import { StorageBreakdown } from './StorageBreakdown';

export function MediaLibrary() {
  const { isAdmin } = useAdminRoles();
  const { toast } = useToast();
  const mutations = useMediaMutations();

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [sortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('library');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = useUnifiedMedia({
    page,
    search: debouncedSearch,
    statusFilter,
    entityTypeFilter,
    sortBy,
    sortDir,
    enabled: isAdmin,
  });

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTriangle style={{ height: 16, width: 16 }} />
        <AlertDescription>Admin access required.</AlertDescription>
      </Alert>
    );
  }

  const toggleItemSelection = (itemId: string) => {
    const next = new Set(selectedItems);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    setSelectedItems(next);
  };

  const handleStar = (item: UnifiedMediaItem) => {
    mutations.toggleStar.mutate(item);
  };

  const handleBulkDelete = () => {
    const toDelete = items.filter(i => selectedItems.has(i.id) && i.usage_count === 0);
    if (toDelete.length === 0) {
      toast({ title: 'No deletable items selected', description: 'Items in use cannot be deleted.', variant: 'destructive' });
      return;
    }
    mutations.bulkDelete.mutate(toDelete, {
      onSuccess: () => {
        setSelectedItems(new Set());
        setBulkMode(false);
      },
    });
    setDeleteDialogOpen(false);
  };

  const handleBulkOptimize = async () => {
    toast({ title: 'Optimization started', description: 'Processing pending images...' });
    try {
      const { error } = await supabase.functions.invoke('optimize-images-batch', {
        body: { batch_size: 30 },
      });
      if (error) throw error;
      toast({ title: 'Optimization complete' });
      refetch();
    } catch {
      toast({ title: 'Optimization failed', variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-screen-lg mx-auto p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-2xl font-bold">Media Library</h4>
          <p className="text-sm text-muted-foreground">
            {totalCount.toLocaleString()} items
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleBulkOptimize}>
            <Zap style={{ height: 14, width: 14, marginRight: 4 }} />
            Optimize All
          </Button>
        </div>
      </div>

      {/* Upload Zone */}
      <MediaUploadZone />

      {/* Tabs: Library / Duplicates / Storage */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="flex flex-col gap-4 mt-4">
          <MediaToolbar
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={(v) => { setStatusFilter(v); setPage(0); }}
            entityTypeFilter={entityTypeFilter}
            onEntityTypeFilterChange={(v) => { setEntityTypeFilter(v); setPage(0); }}
            sortBy={sortBy}
            onSortByChange={(v) => { setSortBy(v); setPage(0); }}
            sortDir={sortDir}
            onSortDirChange={() => {}}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            bulkMode={bulkMode}
            onBulkModeToggle={() => {
              setBulkMode(!bulkMode);
              if (bulkMode) setSelectedItems(new Set());
            }}
            onRefresh={() => refetch()}
          />

          {/* Bulk actions bar */}
          {bulkMode && selectedItems.size > 0 && (
            <div className="flex items-center justify-between border border-border p-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedItems.size === items.length && items.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedItems(new Set(items.map(i => i.id)));
                    else setSelectedItems(new Set());
                  }}
                />
                <span className="text-sm">{selectedItems.size} selected</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 style={{ height: 14, width: 14, marginRight: 4 }} />
                  Delete
                </Button>
              </div>
            </div>
          )}

          <MediaGrid
            loading={isLoading}
            items={items}
            viewMode={viewMode}
            bulkMode={bulkMode}
            selectedItems={selectedItems}
            onToggleSelect={toggleItemSelection}
            onStar={handleStar}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="duplicates" className="mt-4">
          <DuplicateFinderPanel />
        </TabsContent>

        <TabsContent value="storage" className="mt-4">
          <StorageBreakdown />
        </TabsContent>
      </Tabs>

      {/* Bulk delete dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedItems.size} items?</AlertDialogTitle>
            <AlertDialogDescription>
              Items currently in use will be skipped. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default MediaLibrary;
