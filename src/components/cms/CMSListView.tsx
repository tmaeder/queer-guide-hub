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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
import { CMSAdvancedFilters } from './CMSAdvancedFilters';
import { useCMSFilters } from '@/hooks/useCMSFilters';

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
  onViewModeChange
}: CMSListViewProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const {
    filters,
    updateFilter,
    updateSort,
    resetFilters,
    filteredData,
    _allFilteredData,
    filterOptions,
    totalResults,
    totalRecords,
    totalPages,
    currentPage,
    pageSize
  } = useCMSFilters({ data });

  const getSortIcon = (column: string) => {
    if (filters.sortBy !== column) {
      return <ArrowUpDown style={{ height: 16, width: 16 }} />;
    }
    return filters.sortOrder === 'asc' ? <ArrowUp style={{ height: 16, width: 16 }} /> : <ArrowDown style={{ height: 16, width: 16 }} />;
  };

  const SortableHeader = ({ column, children }: { column: string; children: React.ReactNode }) => (
    <TableHead style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => updateSort(column)}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, '&:hover': { color: 'text.primary' } }}>
        {children}
        {getSortIcon(column)}
      </Box>
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

  const getStatusStyle = (status: string): React.CSSProperties => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'published':
        return { backgroundColor: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' };
      case 'draft':
        return { backgroundColor: '#f3f4f6', color: '#1f2937', borderColor: '#e5e7eb' };
      case 'inactive':
      case 'archived':
        return { backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' };
      case 'pending':
      case 'review':
        return { backgroundColor: '#fef9c3', color: '#854d0e', borderColor: '#fef08a' };
      default:
        return { backgroundColor: '#f3f4f6', color: '#1f2937', borderColor: '#e5e7eb' };
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Box sx={{ '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } }, animation: 'pulse 2s infinite' }}>Loading content...</Box>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>
              <Button onClick={onRefresh}>Retry</Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {selectedItems.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {selectedItems.length} selected
              </Typography>
              <Button variant="outline" size="sm">
                Bulk Actions
              </Button>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
        </Box>
      </Box>

      {/* Content Table */}
      <Card>
        <CardHeader>
          <CardTitle>Content List</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredData.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                No content found matching your criteria.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ overflow: 'auto' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: 48 }}>
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
                    <TableHead style={{ width: 96 }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item) => (
                    <TableRow
                      key={`${item.content_type}-${item.id}`}
                      style={selectedItems.includes(item.id) ? { backgroundColor: 'rgba(0,0,0,0.03)' } : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedItems.includes(item.id)}
                          onCheckedChange={(checked) => handleSelectItem(item.id, !!checked)}
                        />
                      </TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          {item.image_url && (
                            <Avatar style={{ height: 32, width: 32 }}>
                              <AvatarImage src={item.image_url} alt={item.title} />
                              <AvatarFallback>
                                {getContentTypeIcon(item.content_type)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <Box>
                            <Box
                              component="button"
                              onClick={() => onEdit(item)}
                              sx={{
                                fontWeight: 500,
                                overflow: 'hidden',
                                display: '-webkit-box',
                                WebkitLineClamp: 1,
                                WebkitBoxOrient: 'vertical',
                                maxWidth: 320,
                                textAlign: 'left',
                                cursor: 'pointer',
                                '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                                textDecorationOffset: '4px',
                                background: 'none',
                                border: 'none',
                                p: 0,
                                font: 'inherit',
                              }}
                            >
                              {item.title || 'Untitled'}
                            </Box>
                            {item.description && (
                              <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', maxWidth: 320 }}>
                                {item.description}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {getContentTypeIcon(item.content_type)}
                          <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                            {item.content_type.replace('_', ' ')}
                          </Typography>
                        </Box>
                      </TableCell>

                      <TableCell>
                        <Select
                          value={item.status || item.workflow_state || 'unknown'}
                          onValueChange={(newStatus) => {
                            const updatedItem = { ...item, status: newStatus, workflow_state: newStatus };
                            onEdit(updatedItem);
                          }}
                        >
                          <SelectTrigger style={{ width: 128, height: 32 }}>
                            <SelectValue>
                              <Badge
                                style={getStatusStyle(item.status || item.workflow_state || 'unknown')}
                                variant="outline"
                              >
                                {item.status || item.workflow_state || 'unknown'}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">
                              <Badge style={getStatusStyle('draft')} variant="outline">draft</Badge>
                            </SelectItem>
                            <SelectItem value="published">
                              <Badge style={getStatusStyle('published')} variant="outline">published</Badge>
                            </SelectItem>
                            <SelectItem value="archived">
                              <Badge style={getStatusStyle('archived')} variant="outline">archived</Badge>
                            </SelectItem>
                            <SelectItem value="pending">
                              <Badge style={getStatusStyle('pending')} variant="outline">pending</Badge>
                            </SelectItem>
                            <SelectItem value="review">
                              <Badge style={getStatusStyle('review')} variant="outline">review</Badge>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Typography variant="body2" color="text.secondary" component="time">
                                {format(new Date(item.updated_at), 'MMM dd, yy')}
                              </Typography>
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
                              <Typography variant="body2" color="text.secondary" component="time">
                                {format(new Date(item.created_at), 'MMM dd, yy')}
                              </Typography>
                            </TooltipTrigger>
                            <TooltipContent>
                              {format(new Date(item.created_at), 'PPP p')}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                            <DropdownMenuContent align="end" style={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                              <DropdownMenuItem onClick={() => onEdit(item)}>
                                <Edit style={{ marginRight: 8, height: 16, width: 16 }} />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled>
                                <Eye style={{ marginRight: 8, height: 16, width: 16 }} />
                                Preview
                              </DropdownMenuItem>
                              {onDelete && (item.content_type === 'cms_content' || item.content_type === 'community_posts') && (
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
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalResults)} of {totalResults} results
            </Typography>
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
            <Typography variant="body2" color="text.secondary">per page</Typography>
          </Box>

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
                  style={currentPage >= totalPages ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </Box>
      )}
    </Box>
  );
}
