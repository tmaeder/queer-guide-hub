import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save, Eye, Settings, Link, Image } from 'lucide-react';
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
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {contentId ? 'Edit Content' : 'Create New Content'}
            </h1>
            <p className="text-muted-foreground">
              {contentId ? 'Update your content' : 'Create and publish new content'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {watchedValues.workflow_state}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {watchedValues.visibility_level}
          </Badge>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="content" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
                <TabsTrigger value="media">Media</TabsTrigger>
                <TabsTrigger value="relationships">Links</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>
                      Core content details and localization
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Language Selector */}
                    <div>
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
                    </div>

                    {/* Title */}
                    <div>
                      <Label htmlFor="title">
                        Title ({selectedLanguage.toUpperCase()})
                      </Label>
                      <Input
                        id="title"
                        value={currentTitle}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        placeholder="Enter content title"
                      />
                    </div>

                    {/* Description */}
                    <div>
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
                    </div>

                    {/* Content Data (JSON Editor would go here in production) */}
                    <div>
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
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="seo" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>SEO & Metadata</CardTitle>
                    <CardDescription>
                      Optimize your content for search engines
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="meta_title">
                        Meta Title ({selectedLanguage.toUpperCase()})
                      </Label>
                      <Input
                        id="meta_title"
                        value={currentMetaTitle}
                        onChange={(e) => handleMetaTitleChange(e.target.value)}
                        placeholder="SEO optimized title"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {currentMetaTitle.length}/60 characters
                      </p>
                    </div>

                    <div>
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
                      <p className="text-xs text-muted-foreground mt-1">
                        {currentMetaDescription.length}/160 characters
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="tags">Tags</Label>
                      <div className="flex gap-2 mb-2">
                        <Input
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          placeholder="Add tag..."
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                        />
                        <Button type="button" onClick={addTag}>Add</Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(watchedValues.tags || []).map((tag) => (
                          <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                            {tag} ×
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="media">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Image className="h-5 w-5" />
                      Media Management
                    </CardTitle>
                    <CardDescription>
                      Manage images and files for this content
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Media management interface coming soon...</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="relationships">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Link className="h-5 w-5" />
                      Content Relationships
                    </CardTitle>
                    <CardDescription>
                      Link this content to other content items
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Relationship management interface coming soon...</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Publishing Options */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Publishing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="content_type">Content Type</Label>
                  <Select 
                    value={watchedValues.content_type} 
                    onValueChange={(value) => setValue('content_type', value)}
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
                </div>

                <div>
                  <Label htmlFor="slug">URL Slug</Label>
                  <Input
                    {...register('slug', { required: 'Slug is required' })}
                    placeholder="url-friendly-slug"
                  />
                  {errors.slug && (
                    <p className="text-xs text-destructive mt-1">{errors.slug.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="workflow_state">Status</Label>
                  <Select 
                    value={watchedValues.workflow_state} 
                    onValueChange={(value) => setValue('workflow_state', value)}
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
                </div>

                <div>
                  <Label htmlFor="visibility_level">Visibility</Label>
                  <Select 
                    value={watchedValues.visibility_level} 
                    onValueChange={(value) => setValue('visibility_level', value)}
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
                </div>

                <div>
                  <Label htmlFor="featured_weight">Featured Weight</Label>
                  <Input
                    type="number"
                    {...register('featured_weight', { valueAsNumber: true })}
                    placeholder="0"
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Higher numbers appear first in featured content
                  </p>
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button type="submit" disabled={loading} className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? 'Saving...' : 'Save'}
                  </Button>
                  <Button type="button" variant="outline">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Content Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>Title:</strong> {currentTitle || 'Untitled'}
                  </div>
                  <div>
                    <strong>Type:</strong> {watchedValues.content_type?.replace('_', ' ')}
                  </div>
                  <div>
                    <strong>Status:</strong> {watchedValues.workflow_state}
                  </div>
                  <div>
                    <strong>Visibility:</strong> {watchedValues.visibility_level}
                  </div>
                  {watchedValues.tags && watchedValues.tags.length > 0 && (
                    <div>
                      <strong>Tags:</strong> {watchedValues.tags.join(', ')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}