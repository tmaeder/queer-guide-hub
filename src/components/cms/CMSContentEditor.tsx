import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save, Eye, Settings, Link, Image } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useCMS } from '@/hooks/useCMS';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import type { Database } from '@/integrations/supabase/types';

interface CMSContentEditorProps {
  contentId?: string | null;
  onClose: () => void;
}

interface ContentFormData {
  content_type: Database['public']['Enums']['cms_content_type'];
  slug: string;
  title: Record<string, string>;
  description: Record<string, string>;
  content_data: Record<string, any>;
  workflow_state: Database['public']['Enums']['cms_workflow_state'];
  visibility_level: Database['public']['Enums']['cms_visibility_level'];
  meta_title: Record<string, string>;
  meta_description: Record<string, string>;
  tags: string[];
  featured_weight: number;
}

export function CMSContentEditor({ contentId, onClose }: CMSContentEditorProps) {
  const { user } = useAuth();
  const { createContent, updateContent, getContentById } = useCMS();
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<any>(null);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [tagInput, setTagInput] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<ContentFormData>({
    defaultValues: {
      content_type: 'page',
      slug: '',
      title: { en: '' },
      description: { en: '' },
      content_data: {},
      workflow_state: 'draft',
      visibility_level: 'private',
      meta_title: { en: '' },
      meta_description: { en: '' },
      tags: [],
      featured_weight: 0,
    }
  });

  const watchedValues = watch();

  // Load existing content if editing
  useEffect(() => {
    if (contentId) {
      loadContent();
    }
  }, [contentId]);

  const loadContent = async () => {
    if (!contentId) return;

    setLoading(true);
    try {
      const data = await getContentById(contentId);
      if (data) {
        setContent(data);
        // Populate form with existing data
        Object.keys(data).forEach((key) => {
          if (key in watchedValues) {
            setValue(key as keyof ContentFormData, data[key]);
          }
        });
      }
    } catch (error) {
      console.error('Error loading content:', error);
      toast({
        title: "Error",
        description: "Failed to load content",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: ContentFormData) => {
    setLoading(true);
    try {
      if (contentId) {
        await updateContent(contentId, data);
      } else {
        await createContent(data);
      }
      onClose();
    } catch (error) {
      console.error('Error saving content:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleTitleChange = (value: string) => {
    const currentTitle = watchedValues.title || {};
    const newTitle = { ...currentTitle, [selectedLanguage]: value };
    setValue('title', newTitle);

    // Auto-generate slug from English title
    if (selectedLanguage === 'en' && !contentId) {
      setValue('slug', generateSlug(value));
    }
  };

  const handleDescriptionChange = (value: string) => {
    const currentDescription = watchedValues.description || {};
    setValue('description', { ...currentDescription, [selectedLanguage]: value });
  };

  const handleMetaTitleChange = (value: string) => {
    const currentMetaTitle = watchedValues.meta_title || {};
    setValue('meta_title', { ...currentMetaTitle, [selectedLanguage]: value });
  };

  const handleMetaDescriptionChange = (value: string) => {
    const currentMetaDescription = watchedValues.meta_description || {};
    setValue('meta_description', { ...currentMetaDescription, [selectedLanguage]: value });
  };

  const addTag = () => {
    if (tagInput.trim()) {
      const currentTags = watchedValues.tags || [];
      if (!currentTags.includes(tagInput.trim())) {
        setValue('tags', [...currentTags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    const currentTags = watchedValues.tags || [];
    setValue('tags', currentTags.filter(t => t !== tag));
  };

  const currentTitle = watchedValues.title?.[selectedLanguage] || '';
  const currentDescription = watchedValues.description?.[selectedLanguage] || '';
  const currentMetaTitle = watchedValues.meta_title?.[selectedLanguage] || '';
  const currentMetaDescription = watchedValues.meta_description?.[selectedLanguage] || '';

  return (
    <Box sx={{ maxWidth: 1152, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="ghost" onClick={onClose}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            Back to Dashboard
          </Button>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              {contentId ? 'Edit Content' : 'Create New Content'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {contentId ? 'Update your content' : 'Create and publish new content'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Badge variant="outline" style={{ textTransform: 'capitalize' }}>
            {watchedValues.workflow_state}
          </Badge>
          <Badge variant="outline" style={{ textTransform: 'capitalize' }}>
            {watchedValues.visibility_level}
          </Badge>
        </Box>
      </Box>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 3 }}>
          {/* Main Content */}
          <Box sx={{ gridColumn: { lg: 'span 2' }, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Tabs defaultValue="content" style={{ width: '100%' }}>
              <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
                <TabsTrigger value="media">Media</TabsTrigger>
                <TabsTrigger value="relationships">Links</TabsTrigger>
              </TabsList>

              <TabsContent value="content">
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Card>
                    <CardHeader>
                      <CardTitle>Basic Information</CardTitle>
                      <CardDescription>
                        Core content details and localization
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {/* Language Selector */}
                        <Box>
                          <Label htmlFor="language">Language</Label>
                          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="en">English</SelectItem>
                              <SelectItem value="es">Spanish</SelectItem>
                              <SelectItem value="fr">French</SelectItem>
                              <SelectItem value="de">German</SelectItem>
                            </SelectContent>
                          </Select>
                        </Box>

                        {/* Title */}
                        <Box>
                          <Label htmlFor="title">
                            Title ({selectedLanguage.toUpperCase()})
                          </Label>
                          <Input
                            id="title"
                            value={currentTitle}
                            onChange={(e) => handleTitleChange(e.target.value)}
                            placeholder="Enter content title"
                          />
                        </Box>

                        {/* Description */}
                        <Box>
                          <Label htmlFor="description">
                            Description ({selectedLanguage.toUpperCase()})
                          </Label>
                          <Textarea
                            id="description"
                            value={currentDescription}
                            onChange={(e) => handleDescriptionChange(e.target.value)}
                            placeholder="Enter content description"
                            rows={4}
                          />
                        </Box>

                        {/* Content Data */}
                        <Box>
                          <Label htmlFor="content_data">Content Data (JSON)</Label>
                          <Textarea
                            {...register('content_data')}
                            placeholder='{"key": "value"}'
                            rows={6}
                            onChange={(e) => {
                              try {
                                const parsed = JSON.parse(e.target.value || '{}');
                                setValue('content_data', parsed);
                              } catch {
                                // Invalid JSON, let user continue typing
                              }
                            }}
                          />
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Box>
              </TabsContent>

              <TabsContent value="seo">
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Card>
                    <CardHeader>
                      <CardTitle>SEO & Metadata</CardTitle>
                      <CardDescription>
                        Optimize your content for search engines
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box>
                          <Label htmlFor="meta_title">
                            Meta Title ({selectedLanguage.toUpperCase()})
                          </Label>
                          <Input
                            id="meta_title"
                            value={currentMetaTitle}
                            onChange={(e) => handleMetaTitleChange(e.target.value)}
                            placeholder="SEO optimized title"
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                            {currentMetaTitle.length}/60 characters
                          </Typography>
                        </Box>

                        <Box>
                          <Label htmlFor="meta_description">
                            Meta Description ({selectedLanguage.toUpperCase()})
                          </Label>
                          <Textarea
                            id="meta_description"
                            value={currentMetaDescription}
                            onChange={(e) => handleMetaDescriptionChange(e.target.value)}
                            placeholder="SEO optimized description"
                            rows={3}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                            {currentMetaDescription.length}/160 characters
                          </Typography>
                        </Box>

                        <Box>
                          <Label htmlFor="tags">Tags</Label>
                          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <Input
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              placeholder="Add tag..."
                              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                            />
                            <Button type="button" onClick={addTag}>Add</Button>
                          </Box>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {(watchedValues.tags || []).map((tag) => (
                              <Badge key={tag} variant="secondary" style={{ cursor: 'pointer' }} onClick={() => removeTag(tag)}>
                                {tag} x
                              </Badge>
                            ))}
                          </Box>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Box>
              </TabsContent>

              <TabsContent value="media">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Image style={{ height: 20, width: 20 }} />
                        Media Management
                      </Box>
                    </CardTitle>
                    <CardDescription>
                      Manage images and files for this content
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">Media management is not yet available.</Typography>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="relationships">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Link style={{ height: 20, width: 20 }} />
                        Content Relationships
                      </Box>
                    </CardTitle>
                    <CardDescription>
                      Link this content to other content items
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">Relationship management is not yet available.</Typography>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </Box>

          {/* Sidebar */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Publishing Options */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Settings style={{ height: 20, width: 20 }} />
                    Publishing
                  </Box>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box>
                    <Label htmlFor="content_type">Content Type</Label>
                    <Select
                      value={watchedValues.content_type}
                      onValueChange={(value) => setValue('content_type', value as Database['public']['Enums']['cms_content_type'])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="space">Space</SelectItem>
                        <SelectItem value="place">Place</SelectItem>
                        <SelectItem value="market">Market</SelectItem>
                        <SelectItem value="resource">Resource</SelectItem>
                        <SelectItem value="community">Community</SelectItem>
                        <SelectItem value="news">News</SelectItem>
                        <SelectItem value="page">Page</SelectItem>
                        <SelectItem value="personality">Personality</SelectItem>
                      </SelectContent>
                    </Select>
                  </Box>

                  <Box>
                    <Label htmlFor="slug">URL Slug</Label>
                    <Input
                      {...register('slug', { required: 'Slug is required' })}
                      placeholder="url-friendly-slug"
                    />
                    {errors.slug && (
                      <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                        {errors.slug.message}
                      </Typography>
                    )}
                  </Box>

                  <Box>
                    <Label htmlFor="workflow_state">Status</Label>
                    <Select
                      value={watchedValues.workflow_state}
                      onValueChange={(value) => setValue('workflow_state', value as Database['public']['Enums']['cms_workflow_state'])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </Box>

                  <Box>
                    <Label htmlFor="visibility_level">Visibility</Label>
                    <Select
                      value={watchedValues.visibility_level}
                      onValueChange={(value) => setValue('visibility_level', value as Database['public']['Enums']['cms_visibility_level'])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="restricted">Restricted</SelectItem>
                      </SelectContent>
                    </Select>
                  </Box>

                  <Box>
                    <Label htmlFor="featured_weight">Featured Weight</Label>
                    <Input
                      type="number"
                      {...register('featured_weight', { valueAsNumber: true })}
                      placeholder="0"
                      min="0"
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      Higher numbers appear first in featured content
                    </Typography>
                  </Box>

                  <Separator />

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button type="submit" disabled={loading} style={{ flex: 1 }}>
                      <Save style={{ height: 16, width: 16, marginRight: 8 }} />
                      {loading ? 'Saving...' : 'Save'}
                    </Button>
                    <Button type="button" variant="outline">
                      <Eye style={{ height: 16, width: 16 }} />
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {/* Content Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="body2">
                    <strong>Title:</strong> {currentTitle || 'Untitled'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Type:</strong> {watchedValues.content_type?.replace('_', ' ')}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Status:</strong> {watchedValues.workflow_state}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Visibility:</strong> {watchedValues.visibility_level}
                  </Typography>
                  {watchedValues.tags && watchedValues.tags.length > 0 && (
                    <Typography variant="body2">
                      <strong>Tags:</strong> {watchedValues.tags.join(', ')}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </form>
    </Box>
  );
}
