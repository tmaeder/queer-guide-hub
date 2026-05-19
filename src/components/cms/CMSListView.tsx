import { useState, useRef, useEffect } from 'react';
import {
  Edit,
  Eye,
  Trash2,
  ExternalLink,
  Calendar,
  User,
  Tag,
  MoreHorizontal,
  Grid3X3,
  List,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { format } from 'date-fns';
import { CMSAdvancedFilters } from './CMSAdvancedFilters';
import { useCMSFilters } from '@/hooks/useCMSFilters';
import { useCMSShortcuts } from '@/hooks/useCMSShortcuts';
import { getContentType } from '@/config/contentTypeRegistry';
import { updateRow } from '@/hooks/usePageFetchers';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

interface CMSListViewProps {
  data: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
  onEdit: (content: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
  onRefresh: () => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}

export function CMSListView({
  data,
  loading,
  error,
  onEdit,
  onDelete,
  onRefresh,
  viewMode,
  onViewModeChange,
}: CMSListViewProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const {
    filters,
    updateFilter,
    updateSort,
    resetFilters,
    filteredData,
    filterOptions,
    totalResults,
    totalRecords,
    totalPages,
    currentPage,
    pageSize,
  } = useCMSFilters({ data });

  const getSortIcon = (column: string) => {
    if (filters.sortBy !== column) {
      return <ArrowUpDown style={{ height: 16, width: 16 }} />;
    }
    return filters.sortOrder === 'asc' ? (
      <ArrowUp style={{ height: 16, width: 16 }} />
    ) : (
      <ArrowDown style={{ height: 16, width: 16 }} />
    );
  };

  const SortableHeader = ({ column, children }: { column: string; children: React.ReactNode }) => (
    <TableHead style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => updateSort(column)}>
      <div className="flex items-center gap-2 hover:text-foreground">
        {children}
        {getSortIcon(column)}
      </div>
    </TableHead>
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(filteredData.map((item) => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedItems((prev) => [...prev, id]);
    } else {
      setSelectedItems((prev) => prev.filter((item) => item !== id));
    }
  };

  useCMSShortcuts({
    onNext: () => setFocusedIndex((i) => Math.min(i + 1, Math.max(0, filteredData.length - 1))),
    onPrev: () => setFocusedIndex((i) => Math.max(0, i - 1)),
  });

  useEffect(() => {
    const item = filteredData[focusedIndex];
    if (item) rowRefs.current[item.id as string]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, filteredData]);

  const startInlineEdit = (item: Record<string, unknown>) => {
    setEditingId(item.id as string);
    setEditingValue((item.title as string) ?? '');
  };

  const saveInlineEdit = async (item: Record<string, unknown>) => {
    const cfg = getContentType(item.content_type as string);
    const tableName = cfg?.tableName;
    if (!tableName) {
      setEditingId(null);
      return;
    }
    const titleField = item.content_type === 'events' ? 'title' : (cfg?.titleField ?? 'title');
    const newVal = editingValue.trim();
    if (!newVal || newVal === (item.title as string)) {
      setEditingId(null);
      return;
    }
    const { error } = await updateRow(tableName, item.id, { [titleField]: newVal });
    setEditingId(null);
    if (error) {
      toast({ title: 'Save failed', description: (error as { message: string }).message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved' });
      onRefresh();
    }
  };

  const getStatusStyle = (status: string): React.CSSProperties => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'published':
        return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--muted))' };
      case 'draft':
        return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--muted))' };
      case 'inactive':
      case 'archived':
        return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--muted))' };
      case 'pending':
      case 'review':
        return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground) / 0.7)', borderColor: 'hsl(var(--muted))' };
      default:
        return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--muted))' };
    }
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'events':
        return <Calendar style={{ height: 16, width: 16 }} />;
      case 'venues':
        return <ExternalLink style={{ height: 16, width: 16 }} />;
      case 'personalities':
        return <User style={{ height: 16, width: 16 }} />;
      default:
        return <Tag style={{ height: 16, width: 16 }} />;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <CMSAdvancedFilters
          filters={filters}
          onFilterChange={updateFilter}
          onReset={resetFilters}
          filterOptions={filterOptions}
          totalResults={0}
          totalRecords={0}
        />
        <Card>
          <CardContent>
            <div className="p-8 text-center">
              <div className="animate-pulse">
                Loading content...
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <CMSAdvancedFilters
          filters={filters}
          onFilterChange={updateFilter}
          onReset={resetFilters}
          filterOptions={filterOptions}
          totalResults={0}
          totalRecords={0}
        />
        <Card>
          <CardContent>
            <div className="p-8 text-center">
              <p className="text-destructive mb-4">
                {error}
              </p>
              <Button onClick={onRefresh}>Retry</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Advanced Filters */}
      <CMSAdvancedFilters
        filters={filters}
        onFilterChange={updateFilter}
        onReset={resetFilters}
        filterOptions={filterOptions}
        totalResults={totalResults}
        totalRecords={totalRecords}
      />

      {/* View Mode Toggle & Bulk Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectedItems.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedItems.length} selected
              </span>
              <Button variant="outline" size="sm">
                Bulk Actions
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
          >
            <Grid3X3 style={{ height: 16, width: 16 }} />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('list')}
          >
            <List style={{ height: 16, width: 16 }} />
          </Button>
        </div>
      </div>

      {/* Content Table */}
      <Card>
        <CardHeader>
          <CardTitle>Content List</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No content found matching your criteria.
              </p>
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: 48 }}>
                      <Checkbox
                        checked={
                          selectedItems.length === filteredData.length && filteredData.length > 0
                        }
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <SortableHeader column="title">Title</SortableHeader>
                    <SortableHeader column="content_type">Type</SortableHeader>
                    <SortableHeader column="status">Status</SortableHeader>
                    <SortableHeader column="updated_at">Updated</SortableHeader>
                    <SortableHeader column="created_at">Created</SortableHeader>
                    <TableHead style={{ width: 96 }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item, idx) => (
                    <TableRow
                      key={`${item.content_type}-${item.id}`}
                      ref={(el) => {
                        rowRefs.current[item.id as string] = el;
                      }}
                      style={{
                        ...(selectedItems.includes(item.id as string)
                          ? { backgroundColor: 'hsl(var(--foreground) / 0.03)' }
                          : {}),
                        ...(idx === focusedIndex
                          ? { outline: '2px solid var(--primary)', outlineOffset: -2 }
                          : {}),
                      }}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedItems.includes(item.id)}
                          onCheckedChange={(checked) => handleSelectItem(item.id, !!checked)}
                        />
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-3">
                          {item.image_url && (
                            <Avatar style={{ height: 32, width: 32 }}>
                              <AvatarImage src={item.image_url} alt={item.title} />
                              <AvatarFallback>
                                {getContentTypeIcon(item.content_type)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div>
                            {editingId === (item.id as string) ? (
                              <Input
                                autoFocus
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={() => saveInlineEdit(item)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveInlineEdit(item);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                style={{ height: 28, maxWidth: 320 }}
                              />
                            ) : (
                              <button
                                onClick={() => onEdit(item)}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  startInlineEdit(item);
                                }}
                                title="Double-click to rename"
                                className="font-medium text-left cursor-pointer bg-transparent border-0 p-0 hover:text-primary hover:underline"
                                style={{
                                  overflow: 'hidden',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 1,
                                  WebkitBoxOrient: 'vertical',
                                  maxWidth: 320,
                                  font: 'inherit',
                                }}
                              >
                                {(item.title as string) || 'Untitled'}
                              </button>
                            )}
                            {item.description && (
                              <p
                                className="text-sm text-muted-foreground"
                                style={{
                                  overflow: 'hidden',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 1,
                                  WebkitBoxOrient: 'vertical',
                                  maxWidth: 320,
                                }}
                              >
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getContentTypeIcon(item.content_type)}
                          <span className="text-sm capitalize">
                            {item.content_type.replace('_', ' ')}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Select
                          value={item.status || item.workflow_state || 'unknown'}
                          onValueChange={(newStatus) => {
                            const updatedItem = {
                              ...item,
                              status: newStatus,
                              workflow_state: newStatus,
                            };
                            onEdit(updatedItem);
                          }}
                        >
                          <SelectTrigger style={{ width: 128, height: 32 }}>
                            <SelectValue>
                              <Badge
                                style={getStatusStyle(
                                  item.status || item.workflow_state || 'unknown',
                                )}
                                variant="outline"
                              >
                                {item.status || item.workflow_state || 'unknown'}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">
                              <Badge style={getStatusStyle('draft')} variant="outline">
                                draft
                              </Badge>
                            </SelectItem>
                            <SelectItem value="published">
                              <Badge style={getStatusStyle('published')} variant="outline">
                                published
                              </Badge>
                            </SelectItem>
                            <SelectItem value="archived">
                              <Badge style={getStatusStyle('archived')} variant="outline">
                                archived
                              </Badge>
                            </SelectItem>
                            <SelectItem value="pending">
                              <Badge style={getStatusStyle('pending')} variant="outline">
                                pending
                              </Badge>
                            </SelectItem>
                            <SelectItem value="review">
                              <Badge style={getStatusStyle('review')} variant="outline">
                                review
                              </Badge>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <time className="text-sm text-muted-foreground">
                                {format(new Date(item.updated_at), 'MMM dd, yy')}
                              </time>
                            </TooltipTrigger>
                            <TooltipContent>
                              {format(new Date(item.updated_at), 'PPP p')}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>

                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <time className="text-sm text-muted-foreground">
                                {format(new Date(item.created_at), 'MMM dd, yy')}
                              </time>
                            </TooltipTrigger>
                            <TooltipContent>
                              {format(new Date(item.created_at), 'PPP p')}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(item)}
                            style={{ height: 32, paddingLeft: 8, paddingRight: 8 }}
                          >
                            <Edit style={{ height: 16, width: 16 }} />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" style={{ height: 32, width: 32, padding: 0 }}>
                                <MoreHorizontal style={{ height: 16, width: 16 }} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              style={{
                                backgroundColor: 'var(--background)',
                                border: '1px solid var(--border)',
                                boxShadow: '0 4px 6px -1px hsl(var(--foreground) / 0.1)',
                              }}
                            >
                              <DropdownMenuItem onClick={() => onEdit(item)}>
                                <Edit style={{ marginRight: 8, height: 16, width: 16 }} />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled>
                                <Eye style={{ marginRight: 8, height: 16, width: 16 }} />
                                Preview
                              </DropdownMenuItem>
                              {onDelete &&
                                (item.content_type === 'cms_content' ||
                                  item.content_type === 'community_posts') && (
                                  <DropdownMenuItem
                                    onClick={() => onDelete(item.id)}
                                    style={{ color: 'var(--destructive)' }}
                                  >
                                    <Trash2 style={{ marginRight: 8, height: 16, width: 16 }} />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, totalResults)} of {totalResults} results
            </span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => updateFilter('pageSize', parseInt(value))}
            >
              <SelectTrigger style={{ width: 80, height: 32 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              per page
            </span>
          </div>

          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => currentPage > 1 && updateFilter('page', currentPage - 1)}
                  style={currentPage <= 1 ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                />
              </PaginationItem>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => updateFilter('page', pageNum)}
                      isActive={currentPage === pageNum}
                      style={{ cursor: 'pointer' }}
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}

              {totalPages > 5 && currentPage < totalPages - 2 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}

              <PaginationItem>
                <PaginationNext
                  onClick={() => currentPage < totalPages && updateFilter('page', currentPage + 1)}
                  style={
                    currentPage >= totalPages ? { pointerEvents: 'none', opacity: 0.5 } : undefined
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
