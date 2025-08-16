import { useState, useEffect } from 'react';
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
import { UniversalContentCreator } from './UniversalContentCreator';
import { UniversalContentEditor } from './UniversalContentEditor';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/components/ui/use-toast';
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
    hasNextPage,
    fetchAllContent, 
    deleteUniversalContent 
  } = useUniversalCMS();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedContent, setSelectedContent] = useState<any>(null);
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
  }, [filters]);

  const handleFilterChange = (key: keyof ContentFilters, value: any) => {
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
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{error}</p>
          <Button onClick={handleRefresh} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Universal Content Management</h1>
          <p className="text-muted-foreground">Manage all content across the platform</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsCreatorOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Content
          </Button>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="content-list">
            <Database className="h-4 w-4 mr-2" />
            Content List
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {contentStats.map((stat) => (
              <Card 
                key={stat.content_type}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleContentTypeFilter(stat.content_type)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium capitalize">
                    {stat.content_type.replace('_', ' ')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.count.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click to view all
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="content-list" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters & Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-center">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search content..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                <div className="flex gap-2">
                  <Select value={filters.contentType} onValueChange={(value) => handleFilterChange('contentType', value)}>
                    <SelectTrigger className="w-48">
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
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content Items</CardTitle>
            </CardHeader>
            <CardContent>
              {allContent.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No content found matching your criteria.
                </div>
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
                          <div>
                            <div className="font-medium">{content.title}</div>
                            {content.description && (
                              <div className="text-sm text-muted-foreground truncate max-w-xs">
                                {content.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {content.content_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={`${getStatusColor(content.status || 'unknown', content.content_type)} text-white`}
                          >
                            {content.status || 'unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDistanceToNow(new Date(content.updated_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setSelectedContent(content)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl max-h-[80vh]">
                                <DialogHeader>
                                  <DialogTitle>{content.title}</DialogTitle>
                                </DialogHeader>
                                <ScrollArea className="h-[60vh]">
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <h4 className="font-semibold">Content Type</h4>
                                        <p className="capitalize">{content.content_type.replace('_', ' ')}</p>
                                      </div>
                                      <div>
                                        <h4 className="font-semibold">Status</h4>
                                        <Badge className={`${getStatusColor(content.status || 'unknown', content.content_type)} text-white`}>
                                          {content.status || 'unknown'}
                                        </Badge>
                                      </div>
                                    </div>
                                    
                                    {content.description && (
                                      <div>
                                        <h4 className="font-semibold">Description</h4>
                                        <p>{content.description}</p>
                                      </div>
                                    )}

                                    {content.metadata && (
                                      <div>
                                        <h4 className="font-semibold">Metadata</h4>
                                        <pre className="bg-muted p-4 rounded text-sm overflow-auto">
                                          {JSON.stringify(content.metadata, null, 2)}
                                        </pre>
                                      </div>
                                    )}

                                    <div>
                                      <h4 className="font-semibold">Raw Data</h4>
                                      <pre className="bg-muted p-4 rounded text-sm overflow-auto">
                                        {JSON.stringify(content.raw_data, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
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
                              <Edit className="h-4 w-4" />
                            </Button>
                            
                            {(content.content_type === 'cms_content' || content.content_type === 'community_posts') && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleDelete(content.content_type, content.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex justify-center">
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
                </div>
              )}

              {/* Results info */}
              <div className="mt-4 text-sm text-muted-foreground text-center">
                Showing {allContent.length} of {totalCount} results
                {filters.contentType !== 'all' && ` in ${filters.contentType}`}
                {filters.search && ` matching "${filters.search}"`}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Simple modals - removing for now to fix build errors */}
      {isCreatorOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Create Content</h3>
            <p className="text-muted-foreground mb-4">Content creation will be implemented in the next iteration.</p>
            <Button onClick={() => setIsCreatorOpen(false)}>Close</Button>
          </div>
        </div>
      )}
      
      {isEditorOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit Content</h3>
            <p className="text-muted-foreground mb-4">Content editing will be implemented in the next iteration.</p>
            <Button onClick={() => setIsEditorOpen(false)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}