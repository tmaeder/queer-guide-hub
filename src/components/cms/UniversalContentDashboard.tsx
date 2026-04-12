import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useUniversalCMS, type ContentFilters } from '@/hooks/useUniversalCMS';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Search, Filter, Plus, Edit, Trash2, Eye, RefreshCw, BarChart3, Database } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

export function UniversalContentDashboard() {
  const {
    allContent,
    contentStats,
    loading,
    error,
    totalCount,
    currentPage,
    _hasNextPage,
    fetchAllContent,
    deleteUniversalContent
  } = useUniversalCMS();

  const [activeTab, setActiveTab] = useState('overview');
  const [_selectedContent, setSelectedContent] = useState<Record<string, unknown> | null>(null);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Filters state
  const [filters, setFilters] = useState<ContentFilters>({
    contentType: 'all',
    search: '',
    status: '',
    page: 1,
    limit: 50
  });

  const [searchInput, setSearchInput] = useState('');

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput, page: 1 }));
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  // Fetch content when filters change
  useEffect(() => {
    fetchAllContent(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAllContent defined outside, re-run on filters change
  }, [filters]);

  const handleFilterChange = (key: keyof ContentFilters, value: unknown) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleContentTypeFilter = (type: string) => {
    setActiveTab('content-list');
    handleFilterChange('contentType', type);
  };

  const totalPages = Math.ceil(totalCount / (filters.limit || 50));

  const getStatusColor = (status: string, contentType: string) => {
    if (contentType === 'cms_content') {
      switch (status) {
        case 'published': return 'bg-green-500';
        case 'draft': return 'bg-yellow-500';
        case 'archived': return 'bg-gray-500';
        default: return 'bg-blue-500';
      }
    }
    return status === 'active' ? 'bg-green-500' : 'bg-gray-500';
  };

  const handleRefresh = () => {
    fetchAllContent(filters);
  };

  const handleDelete = async (contentType: string, id: string) => {
    if (window.confirm('Are you sure you want to delete this content?')) {
      await deleteUniversalContent(contentType, id);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Skeleton sx={{ height: 32, width: 256 }} />
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} sx={{ height: 96 }} />
          ))}
        </Box>
        <Skeleton sx={{ height: 384 }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle sx={{ color: 'error.main' }}>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <Typography>{error}</Typography>
          <Button onClick={handleRefresh} sx={{ mt: 2 }}>
            <RefreshCw sx={{ height: 16, width: 16, mr: 1 }} />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 'bold' }}>Universal Content Management</Typography>
          <Typography sx={{ color: 'text.secondary' }}>Manage all content across the platform</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={() => setIsCreatorOpen(true)}>
            <Plus sx={{ height: 16, width: 16, mr: 1 }} />
            Create Content
          </Button>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw sx={{ height: 16, width: 16, mr: 1 }} />
            Refresh
          </Button>
        </Box>
      </Box>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 sx={{ height: 16, width: 16, mr: 1 }} />
            Overview
          </TabsTrigger>
          <TabsTrigger value="content-list">
            <Database sx={{ height: 16, width: 16, mr: 1 }} />
            Content List
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' } }}>
            {contentStats.map((stat) => (
              <Card
                key={stat.content_type}
                sx={{ cursor: 'pointer', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 6 } }}
                onClick={() => handleContentTypeFilter(stat.content_type)}
              >
                <CardHeader sx={{ pb: 1.5 }}>
                  <CardTitle sx={{ fontSize: 14, fontWeight: 'medium', textTransform: 'capitalize' }}>
                    {stat.content_type.replace('_', ' ')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{stat.count.toLocaleString()}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
                    Click to view all
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </TabsContent>

        <TabsContent value="content-list" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Card>
            <CardHeader>
              <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Filter sx={{ height: 20, width: 20 }} />
                Filters & Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Box sx={{ flex: 1, position: 'relative' }}>
                  <Search sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'text.secondary', height: 16, width: 16 }} />
                  <Input
                    placeholder="Search content..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    sx={{ pl: 4.5 }}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Select value={filters.contentType} onValueChange={(value) => handleFilterChange('contentType', value)}>
                    <SelectTrigger sx={{ width: 192 }}>
                      <SelectValue placeholder="Content Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Content</SelectItem>
                      <SelectItem value="events">Events</SelectItem>
                      <SelectItem value="venues">Venues</SelectItem>
                      <SelectItem value="personalities">Personalities</SelectItem>
                      <SelectItem value="community_groups">Community Groups</SelectItem>
                      <SelectItem value="community_posts">Community Posts</SelectItem>
                      <SelectItem value="cms_content">CMS Content</SelectItem>
                      <SelectItem value="tags">Tags</SelectItem>
                      <SelectItem value="cities">Cities</SelectItem>
                      <SelectItem value="countries">Countries</SelectItem>
                      <SelectItem value="marketplace_listings">Marketplace Listings</SelectItem>
                      <SelectItem value="news_articles">News Articles</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                    <SelectTrigger sx={{ width: 128 }}>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content Items</CardTitle>
            </CardHeader>
            <CardContent>
              {allContent.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  No content found matching your criteria.
                </Box>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allContent.map((content) => (
                      <TableRow key={`${content.content_type}-${content.id}`}>
                        <TableCell>
                          <Box>
                            <Typography sx={{ fontWeight: 'medium' }}>{content.title}</Typography>
                            {content.description && (
                              <Typography sx={{ fontSize: 14, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>
                                {content.description}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" sx={{ textTransform: 'capitalize' }}>
                            {content.content_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            sx={{ bgcolor: getStatusColor(content.status || 'unknown', content.content_type), color: 'white' }}
                          >
                            {content.status || 'unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell sx={{ fontSize: 14 }}>
                          {formatDistanceToNow(new Date(content.updated_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedContent(content)}
                                >
                                  <Eye sx={{ height: 16, width: 16 }} />
                                </Button>
                              </DialogTrigger>
                              <DialogContent sx={{ maxWidth: 896, maxHeight: '80vh' }}>
                                <DialogHeader>
                                  <DialogTitle>{content.title}</DialogTitle>
                                </DialogHeader>
                                <ScrollArea sx={{ height: '60vh' }}>
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                                      <Box>
                                        <Typography variant="h4" sx={{ fontWeight: 'semibold' }}>Content Type</Typography>
                                        <Typography sx={{ textTransform: 'capitalize' }}>{content.content_type.replace('_', ' ')}</Typography>
                                      </Box>
                                      <Box>
                                        <Typography variant="h4" sx={{ fontWeight: 'semibold' }}>Status</Typography>
                                        <Badge sx={{ bgcolor: getStatusColor(content.status || 'unknown', content.content_type), color: 'white' }}>
                                          {content.status || 'unknown'}
                                        </Badge>
                                      </Box>
                                    </Box>

                                    {content.description && (
                                      <Box>
                                        <Typography variant="h4" sx={{ fontWeight: 'semibold' }}>Description</Typography>
                                        <Typography>{content.description}</Typography>
                                      </Box>
                                    )}

                                    {content.metadata && (
                                      <Box>
                                        <Typography variant="h4" sx={{ fontWeight: 'semibold' }}>Metadata</Typography>
                                        <Box component="pre" sx={{ bgcolor: 'background.paper', p: 2, borderRadius: 1, fontSize: 14, overflow: 'auto' }}>
                                          {JSON.stringify(content.metadata, null, 2)}
                                        </Box>
                                      </Box>
                                    )}

                                    <Box>
                                      <Typography variant="h4" sx={{ fontWeight: 'semibold' }}>Raw Data</Typography>
                                      <Box component="pre" sx={{ bgcolor: 'background.paper', p: 2, borderRadius: 1, fontSize: 14, overflow: 'auto' }}>
                                        {JSON.stringify(content.raw_data, null, 2)}
                                      </Box>
                                    </Box>
                                  </Box>
                                </ScrollArea>
                              </DialogContent>
                            </Dialog>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedContent(content);
                                setIsEditorOpen(true);
                              }}
                            >
                              <Edit sx={{ height: 16, width: 16 }} />
                            </Button>

                            {(content.content_type === 'cms_content' || content.content_type === 'community_posts') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(content.content_type, content.id)}
                              >
                                <Trash2 sx={{ height: 16, width: 16 }} />
                              </Button>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                  <Pagination>
                    <PaginationContent>
                      {currentPage > 1 && (
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              handlePageChange(currentPage - 1);
                            }}
                          />
                        </PaginationItem>
                      )}

                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNum = Math.max(1, currentPage - 2) + i;
                        if (pageNum > totalPages) return null;

                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              href="#"
                              isActive={pageNum === currentPage}
                              onClick={(e) => {
                                e.preventDefault();
                                handlePageChange(pageNum);
                              }}
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}

                      {currentPage < totalPages && (
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              handlePageChange(currentPage + 1);
                            }}
                          />
                        </PaginationItem>
                      )}
                    </PaginationContent>
                  </Pagination>
                </Box>
              )}

              {/* Results info */}
              <Box sx={{ mt: 2, fontSize: 14, color: 'text.secondary', textAlign: 'center' }}>
                Showing {allContent.length} of {totalCount} results
                {filters.contentType !== 'all' && ` in ${filters.contentType}`}
                {filters.search && ` matching "${filters.search}"`}
              </Box>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Simple modals - removing for now to fix build errors */}
      {isCreatorOpen && (
        <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <Box sx={{ bgcolor: 'background.paper', p: 3, borderRadius: 2, maxWidth: 448, width: '100%', mx: 2 }}>
            <Typography variant="h3" sx={{ fontWeight: 'semibold', mb: 2 }}>Create Content</Typography>
            <Typography sx={{ color: 'text.secondary', mb: 2 }}>Content creation will be implemented in the next iteration.</Typography>
            <Button onClick={() => setIsCreatorOpen(false)}>Close</Button>
          </Box>
        </Box>
      )}

      {isEditorOpen && (
        <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <Box sx={{ bgcolor: 'background.paper', p: 3, borderRadius: 2, maxWidth: 448, width: '100%', mx: 2 }}>
            <Typography variant="h3" sx={{ fontWeight: 'semibold', mb: 2 }}>Edit Content</Typography>
            <Typography sx={{ color: 'text.secondary', mb: 2 }}>Content editing will be implemented in the next iteration.</Typography>
            <Button onClick={() => setIsEditorOpen(false)}>Close</Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
