import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Filter, Search, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCMS } from '@/hooks/useCMS';
import { useUniversalCMS } from '@/hooks/useUniversalCMS';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { CMSContentEditor } from './CMSContentEditor';
import { CMSMediaManager } from './CMSMediaManager';
import { CMSConnectorManager } from './CMSConnectorManager';
import { CMSDuplicateManager } from './CMSDuplicateManager';
import { UniversalContentDashboard } from './UniversalContentDashboard';
import { UniversalContentEditor } from './UniversalContentEditor';
import { CMSListView } from './CMSListView';
import { MediaLibrary } from './MediaLibrary';
export function CMSDashboard() {
  const navigate = useNavigate();
  const {
    content,
    loading,
    error,
    fetchContent,
    deleteContent,
    publishContent,
    archiveContent
  } = useCMS();
  const {
    allContent,
    contentStats,
    loading: universalLoading,
    error: universalError,
    fetchAllContent
  } = useUniversalCMS();
  const {
    isAdmin,
    canManageContent
  } = useAdminRoles();
  const [selectedTab, setSelectedTab] = useState('universal');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContentType, setSelectedContentType] = useState('all');
  const [selectedWorkflowState, setSelectedWorkflowState] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editingContent, setEditingContent] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  if (!canManageContent) {
    return <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access the CMS dashboard.</p>
          </CardContent>
        </Card>
      </div>;
  }
  const filteredContent = content.filter(item => {
    const matchesSearch = !searchQuery || item.title && Object.values(item.title).some(title => typeof title === 'string' && title.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = selectedContentType === 'all' || item.content_type === selectedContentType;
    const matchesState = selectedWorkflowState === 'all' || item.workflow_state === selectedWorkflowState;
    return matchesSearch && matchesType && matchesState;
  });

  // Filter universal content for CMS Content tab
  const filteredUniversalContent = allContent.filter(item => {
    const matchesSearch = !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase()) || item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedContentType === 'all' || item.content_type === selectedContentType;
    return matchesSearch && matchesType;
  });
  const getStatusColor = (state: string) => {
    switch (state) {
      case 'published':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'review':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'archived':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };
  const handleCreateContent = () => {
    setEditingContent(null);
    setShowEditor(true);
  };
  const handleEditContent = (contentItem: any) => {
    setEditingContent(contentItem);
    setShowEditor(true);
  };
  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingContent(null);
    fetchContent(); // Refresh content list
  };
  const handleAction = async (action: string, id: string) => {
    switch (action) {
      case 'publish':
        await publishContent(id);
        break;
      case 'archive':
        await archiveContent(id);
        break;
      case 'delete':
        await deleteContent(id);
        break;
    }
  };
  const onDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this content?')) {
      await handleAction('delete', id);
    }
  };
  if (showEditor && editingContent) {
    return <div className="container mx-auto px-4 py-8">
        <UniversalContentEditor content={editingContent} onClose={handleCloseEditor} />
      </div>;
  }
  return <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Content Management System</h1>
        <p className="text-muted-foreground">Manage all your content types, media, and integrations</p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="universal">All Content</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
          
          
          <TabsTrigger value="library">Media Library</TabsTrigger>
          <TabsTrigger value="connectors">Connectors</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="universal">
          <UniversalContentDashboard />
        </TabsContent>

        <TabsContent value="list">
          <CMSListView data={allContent} loading={universalLoading} error={universalError} onEdit={handleEditContent} onDelete={onDelete} onRefresh={() => fetchAllContent()} viewMode={viewMode} onViewModeChange={setViewMode} />
        </TabsContent>

        <TabsContent value="content" className="space-y-6">
          {/* Content Management */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search content..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              
              <Select value={selectedContentType} onValueChange={setSelectedContentType}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Content Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="events">Events</SelectItem>
                  <SelectItem value="venues">Venues</SelectItem>
                  <SelectItem value="personalities">Personalities</SelectItem>
                  <SelectItem value="community_groups">Community Groups</SelectItem>
                  <SelectItem value="community_posts">Community Posts</SelectItem>
                  <SelectItem value="cms_content">CMS Content</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedWorkflowState} onValueChange={setSelectedWorkflowState}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleCreateContent} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Content
            </Button>
          </div>

          {/* Content Grid */}
          {universalLoading ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => <Card key={i}>
                  <CardHeader>
                    <div className="h-4 bg-muted animate-pulse rounded" />
                    <div className="h-3 bg-muted animate-pulse rounded w-2/3" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-3 bg-muted animate-pulse rounded" />
                      <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
                    </div>
                  </CardContent>
                </Card>)}
            </div> : universalError ? <Card>
              <CardContent className="p-8 text-center">
                <p className="text-destructive">{universalError}</p>
                <Button onClick={() => fetchAllContent()} className="mt-4">
                  Retry
                </Button>
              </CardContent>
            </Card> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredUniversalContent.map(item => <Card key={`${item.content_type}-${item.id}`} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg line-clamp-2">
                          {item.title || 'Untitled'}
                        </CardTitle>
                        <CardDescription className="capitalize">
                          {item.content_type.replace('_', ' ')}
                        </CardDescription>
                      </div>
                      <Badge className={`${item.status === 'active' || item.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {item.status || 'draft'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {item.description || 'No description'}
                      </p>
                      
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Updated {new Date(item.updated_at).toLocaleDateString()}</span>
                        <span className="capitalize">{item.content_type}</span>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEditContent(item)}>
                          Edit
                        </Button>
                        
                        {(item.content_type === 'cms_content' || item.content_type === 'community_posts') && isAdmin && <Button size="sm" variant="destructive" onClick={() => handleAction('delete', item.id)}>
                            Delete
                          </Button>}
                      </div>
                    </div>
                  </CardContent>
                </Card>)}
            </div>}

          {filteredUniversalContent.length === 0 && !universalLoading && <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No content found matching your criteria.</p>
                <Button onClick={handleCreateContent}>
                  Create your first content
                </Button>
              </CardContent>
            </Card>}
        </TabsContent>

        <TabsContent value="media">
          <CMSMediaManager />
        </TabsContent>

        <TabsContent value="library">
          <MediaLibrary />
        </TabsContent>

        <TabsContent value="connectors">
          <CMSConnectorManager />
        </TabsContent>

        <TabsContent value="duplicates">
          <CMSDuplicateManager />
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                CMS Settings
              </CardTitle>
              <CardDescription>
                Configure your content management system settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Settings panel coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>;
}