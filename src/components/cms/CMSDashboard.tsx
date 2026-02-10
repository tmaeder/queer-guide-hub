import { useState } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCMS } from '@/hooks/useCMS';
import { useUniversalCMS } from '@/hooks/useUniversalCMS';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { CMSDuplicateManager } from './CMSDuplicateManager';
import { UniversalContentDashboard } from './UniversalContentDashboard';
import { UniversalContentEditor } from './UniversalContentEditor';
import { CMSListView } from './CMSListView';
import { MediaLibrary } from './MediaLibrary';
import { ImageOptimizationManager } from '@/components/admin/ImageOptimizationManager';

export function CMSDashboard() {
  const {
    content,
    fetchContent,
    deleteContent,
    publishContent,
    archiveContent
  } = useCMS();
  const {
    allContent,
    loading: universalLoading,
    error: universalError,
    fetchAllContent
  } = useUniversalCMS();
  const {
    canManageContent
  } = useAdminRoles();
  const [selectedTab, setSelectedTab] = useState('universal');
  const [showEditor, setShowEditor] = useState(false);
  const [editingContent, setEditingContent] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  if (!canManageContent) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access the CMS dashboard.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleEditContent = (contentItem: any) => {
    setEditingContent(contentItem);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingContent(null);
    fetchContent();
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
    return (
      <div className="container mx-auto px-4 py-8">
        <UniversalContentEditor content={editingContent} onClose={handleCloseEditor} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Content Management System</h1>
        <p className="text-muted-foreground">Manage all your content types, media, and integrations</p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="universal">All Content</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="library">Media Library</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
          <TabsTrigger value="images">Image Optimizer</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="universal">
          <UniversalContentDashboard />
        </TabsContent>

        <TabsContent value="list">
          <CMSListView
            data={allContent}
            loading={universalLoading}
            error={universalError}
            onEdit={handleEditContent}
            onDelete={onDelete}
            onRefresh={() => fetchAllContent()}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </TabsContent>

        <TabsContent value="library">
          <MediaLibrary />
        </TabsContent>

        <TabsContent value="duplicates">
          <CMSDuplicateManager />
        </TabsContent>

        <TabsContent value="images">
          <ImageOptimizationManager />
        </TabsContent>

        <TabsContent value="settings">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" aria-hidden="true" />
                  Content Settings
                </CardTitle>
                <CardDescription>
                  Configure content creation and publishing settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="autosave" className="text-sm font-medium">Auto-save drafts</Label>
                    <p className="text-xs text-muted-foreground">Automatically save content while editing</p>
                  </div>
                  <Switch id="autosave" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="require-review" className="text-sm font-medium">Require review before publish</Label>
                    <p className="text-xs text-muted-foreground">All content must be reviewed before going live</p>
                  </div>
                  <Switch id="require-review" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="versioning" className="text-sm font-medium">Enable content versioning</Label>
                    <p className="text-xs text-muted-foreground">Keep revision history of content changes</p>
                  </div>
                  <Switch id="versioning" defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Media Settings</CardTitle>
                <CardDescription>
                  Configure media upload and management settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="max-file-size" className="text-sm font-medium block mb-2">Maximum file size (MB)</Label>
                  <Input id="max-file-size" type="number" defaultValue="10" className="w-24" />
                </div>
                <div>
                  <Label className="text-sm font-medium block mb-2">Allowed file types</Label>
                  <p className="text-xs text-muted-foreground">jpg, png, gif, webp, svg, pdf, doc, docx</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="compress-images" className="text-sm font-medium">Compress images on upload</Label>
                    <p className="text-xs text-muted-foreground">Optimize images for web performance</p>
                  </div>
                  <Switch id="compress-images" defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>SEO Settings</CardTitle>
                <CardDescription>
                  Configure search engine optimization settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="auto-meta" className="text-sm font-medium">Auto-generate meta descriptions</Label>
                    <p className="text-xs text-muted-foreground">Create meta descriptions from content excerpts</p>
                  </div>
                  <Switch id="auto-meta" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="gen-sitemap" className="text-sm font-medium">Generate XML sitemap</Label>
                    <p className="text-xs text-muted-foreground">Automatically update sitemap with new content</p>
                  </div>
                  <Switch id="gen-sitemap" defaultChecked />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
