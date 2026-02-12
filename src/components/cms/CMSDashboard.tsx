import { useState } from 'react';
import { Settings } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
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
      <Container sx={{ py: 4 }}>
        <Card>
          <CardContent>
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>Access Denied</Typography>
              <Typography variant="body2" color="text.secondary">You don't have permission to access the CMS dashboard.</Typography>
            </Box>
          </CardContent>
        </Card>
      </Container>
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
      <Container sx={{ py: 4 }}>
        <UniversalContentEditor content={editingContent} onClose={handleCloseEditor} />
      </Container>
    );
  }

  return (
    <Container sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'text.primary', mb: 1 }}>Content Management System</Typography>
        <Typography variant="body2" color="text.secondary">Manage all your content types, media, and integrations</Typography>
      </Box>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TabsList sx={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(6, 1fr)' }}>
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Settings style={{ height: 20, width: 20 }} aria-hidden="true" />
                      Content Settings
                    </Box>
                  </CardTitle>
                  <CardDescription>
                    Configure content creation and publishing settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Label htmlFor="autosave">Auto-save drafts</Label>
                        <Typography variant="caption" color="text.secondary" component="p">Automatically save content while editing</Typography>
                      </Box>
                      <Switch id="autosave" defaultChecked />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Label htmlFor="require-review">Require review before publish</Label>
                        <Typography variant="caption" color="text.secondary" component="p">All content must be reviewed before going live</Typography>
                      </Box>
                      <Switch id="require-review" />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Label htmlFor="versioning">Enable content versioning</Label>
                        <Typography variant="caption" color="text.secondary" component="p">Keep revision history of content changes</Typography>
                      </Box>
                      <Switch id="versioning" defaultChecked />
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Media Settings</CardTitle>
                  <CardDescription>
                    Configure media upload and management settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box>
                      <Label htmlFor="max-file-size" sx={{ display: 'block', mb: 1 }}>Maximum file size (MB)</Label>
                      <Input id="max-file-size" type="number" defaultValue="10" style={{ width: 96 }} />
                    </Box>
                    <Box>
                      <Label sx={{ display: 'block', mb: 1 }}>Allowed file types</Label>
                      <Typography variant="caption" color="text.secondary">jpg, png, gif, webp, svg, pdf, doc, docx</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Label htmlFor="compress-images">Compress images on upload</Label>
                        <Typography variant="caption" color="text.secondary" component="p">Optimize images for web performance</Typography>
                      </Box>
                      <Switch id="compress-images" defaultChecked />
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>SEO Settings</CardTitle>
                  <CardDescription>
                    Configure search engine optimization settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Label htmlFor="auto-meta">Auto-generate meta descriptions</Label>
                        <Typography variant="caption" color="text.secondary" component="p">Create meta descriptions from content excerpts</Typography>
                      </Box>
                      <Switch id="auto-meta" defaultChecked />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Label htmlFor="gen-sitemap">Generate XML sitemap</Label>
                        <Typography variant="caption" color="text.secondary" component="p">Automatically update sitemap with new content</Typography>
                      </Box>
                      <Switch id="gen-sitemap" defaultChecked />
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </TabsContent>
        </Box>
      </Tabs>
    </Container>
  );
}
