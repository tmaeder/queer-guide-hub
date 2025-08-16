import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUniversalCMS } from '@/hooks/useUniversalCMS';
import { Search, Eye, Trash2, Filter, Database, BarChart3, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

export function UniversalContentDashboard() {
  const { allContent, contentStats, loading, error, fetchAllContent, deleteUniversalContent } = useUniversalCMS();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContentType, setSelectedContentType] = useState('all');
  const [selectedContent, setSelectedContent] = useState<any>(null);

  const filteredContent = allContent.filter(content => {
    const matchesSearch = content.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         content.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         content.content_type.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = selectedContentType === 'all' || content.content_type === selectedContentType;
    
    return matchesSearch && matchesType;
  });

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

  const handleDelete = async (contentType: string, id: string) => {
    if (window.confirm('Are you sure you want to delete this content?')) {
      await deleteUniversalContent(contentType, id);
    }
  };

  const handleRefresh = () => {
    fetchAllContent(selectedContentType === 'all' ? undefined : selectedContentType);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading content...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Content</CardTitle>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Universal Content Management</h1>
          <p className="text-muted-foreground">Manage all content across the platform</p>
        </div>
        <Button onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="content">
            <Database className="h-4 w-4 mr-2" />
            All Content
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Statistics Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {contentStats.map((stat) => (
              <Card key={stat.content_type}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium capitalize">
                    {stat.content_type.replace('_', ' ')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.count.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Table: {stat.table_name}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Content Type Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Content Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {contentStats.map((stat) => (
                  <div key={stat.content_type} className="flex items-center justify-between">
                    <span className="capitalize font-medium">
                      {stat.content_type.replace('_', ' ')}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-muted rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full" 
                          style={{ 
                            width: `${(stat.count / Math.max(...contentStats.map(s => s.count))) * 100}%` 
                          }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground min-w-[3rem] text-right">
                        {stat.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters & Search
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search content..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={selectedContentType} onValueChange={setSelectedContentType}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Content Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Content Types</SelectItem>
                    <SelectItem value="events">Events</SelectItem>
                    <SelectItem value="venues">Venues</SelectItem>
                    <SelectItem value="personalities">Personalities</SelectItem>
                    <SelectItem value="community_groups">Community Groups</SelectItem>
                    <SelectItem value="community_posts">Community Posts</SelectItem>
                    <SelectItem value="cms_content">CMS Content</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-muted-foreground">
                Showing {filteredContent.length} of {allContent.length} items
              </div>
            </CardContent>
          </Card>

          {/* Content Table */}
          <Card>
            <CardHeader>
              <CardTitle>Content Items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContent.map((content) => (
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
                        {format(new Date(content.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(content.updated_at), 'MMM dd, yyyy')}
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
              
              {filteredContent.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No content found matching your criteria.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}