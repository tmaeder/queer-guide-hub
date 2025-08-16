import { useState } from 'react';
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
  ArrowDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from '@/components/ui/pagination';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CMSAdvancedFilters } from './CMSAdvancedFilters';
import { useCMSFilters } from '@/hooks/useCMSFilters';

interface CMSListViewProps {
  data: any[];
  loading: boolean;
  error: string | null;
  onEdit: (content: any) => void;
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
  onViewModeChange
}: CMSListViewProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  
  const {
    filters,
    updateFilter,
    updateSort,
    resetFilters,
    filteredData,
    allFilteredData,
    filterOptions,
    totalResults,
    totalRecords,
    totalPages,
    currentPage,
    pageSize
  } = useCMSFilters({ data });

  const getSortIcon = (column: string) => {
    if (filters.sortBy !== column) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return filters.sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  const SortableHeader = ({ column, children }: { column: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => updateSort(column)}>
      <div className="flex items-center gap-2 hover:text-foreground">
        {children}
        {getSortIcon(column)}
      </div>
    </TableHead>
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(filteredData.map(item => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedItems(prev => [...prev, id]);
    } else {
      setSelectedItems(prev => prev.filter(item => item !== id));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'published':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'inactive':
      case 'archived':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
      case 'review':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'events':
        return <Calendar className="h-4 w-4" />;
      case 'venues':
        return <ExternalLink className="h-4 w-4" />;
      case 'personalities':
        return <User className="h-4 w-4" />;
      default:
        return <Tag className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <CMSAdvancedFilters
          filters={filters}
          onFilterChange={updateFilter}
          onReset={resetFilters}
          filterOptions={filterOptions}
          totalResults={0}
          totalRecords={0}
        />
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-pulse">Loading content...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <CMSAdvancedFilters
          filters={filters}
          onFilterChange={updateFilter}
          onReset={resetFilters}
          filterOptions={filterOptions}
          totalResults={0}
          totalRecords={0}
        />
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={onRefresh}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('list')}
          >
            <List className="h-4 w-4" />
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
            <div className="text-center py-8 text-muted-foreground">
              No content found matching your criteria.
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedItems.length === filteredData.length && filteredData.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <SortableHeader column="title">Title</SortableHeader>
                    <SortableHeader column="content_type">Type</SortableHeader>
                    <SortableHeader column="status">Status</SortableHeader>
                    <SortableHeader column="updated_at">Updated</SortableHeader>
                    <SortableHeader column="created_at">Created</SortableHeader>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item) => (
                    <TableRow 
                      key={`${item.content_type}-${item.id}`}
                      className={cn(
                        "hover:bg-muted/50",
                        selectedItems.includes(item.id) && "bg-muted/30"
                      )}
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
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={item.image_url} alt={item.title} />
                              <AvatarFallback>
                                {getContentTypeIcon(item.content_type)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div>
                            <button
                              onClick={() => onEdit(item)}
                              className="font-medium line-clamp-1 max-w-xs text-left hover:text-primary transition-colors cursor-pointer underline-offset-4 hover:underline"
                            >
                              {item.title || 'Untitled'}
                            </button>
                            {item.description && (
                              <div className="text-sm text-muted-foreground line-clamp-1 max-w-xs">
                                {item.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getContentTypeIcon(item.content_type)}
                          <span className="capitalize text-sm">
                            {item.content_type.replace('_', ' ')}
                          </span>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Select
                          value={item.status || item.workflow_state || 'unknown'}
                          onValueChange={(newStatus) => {
                            // Update the item status directly
                            const updatedItem = { ...item, status: newStatus, workflow_state: newStatus };
                            onEdit(updatedItem);
                          }}
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue>
                              <Badge 
                                className={getStatusColor(item.status || item.workflow_state || 'unknown')}
                                variant="outline"
                              >
                                {item.status || item.workflow_state || 'unknown'}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">
                              <Badge className={getStatusColor('draft')} variant="outline">
                                draft
                              </Badge>
                            </SelectItem>
                            <SelectItem value="published">
                              <Badge className={getStatusColor('published')} variant="outline">
                                published
                              </Badge>
                            </SelectItem>
                            <SelectItem value="archived">
                              <Badge className={getStatusColor('archived')} variant="outline">
                                archived
                              </Badge>
                            </SelectItem>
                            <SelectItem value="pending">
                              <Badge className={getStatusColor('pending')} variant="outline">
                                pending
                              </Badge>
                            </SelectItem>
                            <SelectItem value="review">
                              <Badge className={getStatusColor('review')} variant="outline">
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
                            className="h-8 px-2"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-background border shadow-md">
                              <DropdownMenuItem onClick={() => onEdit(item)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled>
                                <Eye className="mr-2 h-4 w-4" />
                                Preview
                              </DropdownMenuItem>
                              {onDelete && (item.content_type === 'cms_content' || item.content_type === 'community_posts') && (
                                <DropdownMenuItem 
                                  onClick={() => onDelete(item.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalResults)} of {totalResults} results
            </span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => updateFilter('pageSize', parseInt(value))}
            >
              <SelectTrigger className="w-20 h-8">
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
            <span>per page</span>
          </div>

          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => currentPage > 1 && updateFilter('page', currentPage - 1)}
                  className={cn(
                    currentPage <= 1 && "pointer-events-none opacity-50"
                  )}
                />
              </PaginationItem>
              
              {/* Page numbers */}
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
                      className="cursor-pointer"
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
                  className={cn(
                    currentPage >= totalPages && "pointer-events-none opacity-50"
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}