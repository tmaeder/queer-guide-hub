import { useState } from 'react';
import { Plus, Save, X, Tag, Globe, Building, User, Calendar, Users } from 'lucide-react';
import Box from '@mui/material/Box';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface UniversalContentCreatorProps {
  onContentCreated: () => void;
}

export function UniversalContentCreator({ onContentCreated }: UniversalContentCreatorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [contentType, setContentType] = useState<string>('');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  const contentTypes = [
    { value: 'events', label: 'Events', icon: <Calendar style={{ height: 16, width: 16 }} /> },
    { value: 'venues', label: 'Venues', icon: <Building style={{ height: 16, width: 16 }} /> },
    { value: 'personalities', label: 'Personalities', icon: <User style={{ height: 16, width: 16 }} /> },
    { value: 'community_groups', label: 'Community Groups', icon: <Users style={{ height: 16, width: 16 }} /> },
    { value: 'community_posts', label: 'Community Posts', icon: <Tag style={{ height: 16, width: 16 }} /> },
    { value: 'cms_content', label: 'CMS Content', icon: <Tag style={{ height: 16, width: 16 }} /> },
    { value: 'tags', label: 'Tags', icon: <Tag style={{ height: 16, width: 16 }} /> },
    { value: 'cities', label: 'Cities', icon: <Building style={{ height: 16, width: 16 }} /> },
    { value: 'countries', label: 'Countries', icon: <Globe style={{ height: 16, width: 16 }} /> },
    { value: 'marketplace_listings', label: 'Marketplace Listings', icon: <Building style={{ height: 16, width: 16 }} /> },
    { value: 'news_articles', label: 'News Articles', icon: <Tag style={{ height: 16, width: 16 }} /> }
  ];

  const handleFieldChange = (field: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const resetForm = () => {
    setFormData({});
    setContentType('');
    setActiveTab('basic');
  };

  const handleCreate = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to create content",
        variant: "destructive",
      });
      return;
    }

    if (!contentType) {
      toast({
        title: "Content type required",
        description: "Please select a content type",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Prepare data for insertion
      const insertData = {
        ...formData,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Create table name mapping for type safety
      const validTables = {
        'events': 'events',
        'venues': 'venues',
        'personalities': 'personalities',
        'community_groups': 'community_groups',
        'community_posts': 'community_posts',
        'cms_content': 'cms_content',
        'unified_tags': 'unified_tags',
        'cities': 'cities',
        'countries': 'countries',
        'marketplace_listings': 'marketplace_listings',
        'news_articles': 'news_articles'
      } as const;

      const tableName = contentType === 'tags' ? 'unified_tags' : contentType;

      if (!(tableName in validTables)) {
        throw new Error('Invalid content type');
      }

      // Handle specific field mappings for different content types
      switch (contentType) {
        case 'events':
          if (!insertData.title) {
            throw new Error('Event title is required');
          }
          insertData.status = insertData.status || 'active';
          break;
        case 'venues':
          if (!insertData.name) {
            throw new Error('Venue name is required');
          }
          insertData.status = insertData.status || 'active';
          break;
        case 'personalities':
          if (!insertData.name) {
            throw new Error('Personality name is required');
          }
          insertData.status = insertData.status || 'active';
          break;
        case 'community_groups':
          if (!insertData.name) {
            throw new Error('Group name is required');
          }
          insertData.member_count = 0;
          break;
        case 'community_posts':
          if (!insertData.content) {
            throw new Error('Post content is required');
          }
          insertData.user_id = user.id;
          insertData.likes_count = 0;
          insertData.comments_count = 0;
          insertData.shares_count = 0;
          break;
        case 'cms_content':
          if (!insertData.title) {
            throw new Error('Content title is required');
          }
          insertData.workflow_state = insertData.workflow_state || 'draft';
          insertData.visibility_level = insertData.visibility_level || 'private';
          insertData.content_type = insertData.content_type || 'page';
          break;
        case 'tags':
          if (!insertData.name) {
            throw new Error('Tag name is required');
          }
          insertData.usage_count = 0;
          insertData.slug = insertData.slug || insertData.name.toLowerCase().replace(/\s+/g, '-');
          break;
        case 'cities':
          if (!insertData.name) {
            throw new Error('City name is required');
          }
          break;
        case 'countries':
          if (!insertData.name) {
            throw new Error('Country name is required');
          }
          if (!insertData.code) {
            throw new Error('Country code is required');
          }
          break;
        case 'marketplace_listings':
          if (!insertData.title && !insertData.business_name) {
            throw new Error('Title or business name is required');
          }
          insertData.status = insertData.status || 'active';
          break;
        case 'news_articles':
          if (!insertData.title) {
            throw new Error('Article title is required');
          }
          insertData.views_count = 0;
          insertData.is_featured = insertData.is_featured || false;
          break;
      }

      const { error } = await supabase
        .from(tableName as keyof typeof validTables)
        .insert([insertData]);

      if (error) throw error;

      toast({
        title: "Content created",
        description: `${contentTypes.find(ct => ct.value === contentType)?.label} created successfully`,
      });

      resetForm();
      setIsOpen(false);
      onContentCreated();
    } catch (error) {
      console.error('Error creating content:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to create content',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getFormFields = () => {
    switch (contentType) {
      case 'events':
        return {
          basic: [
            { key: 'title', label: 'Event Name', type: 'text', required: true },
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'event_type', label: 'Event Type', type: 'text' },
            { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'cancelled'] }
          ],
          datetime: [
            { key: 'start_date', label: 'Start Date', type: 'datetime-local' },
            { key: 'end_date', label: 'End Date', type: 'datetime-local' },
            { key: 'is_recurring', label: 'Recurring Event', type: 'boolean' }
          ],
          location: [
            { key: 'address', label: 'Address', type: 'text' },
            { key: 'latitude', label: 'Latitude', type: 'number' },
            { key: 'longitude', label: 'Longitude', type: 'number' }
          ]
        };
      case 'venues':
        return {
          basic: [
            { key: 'name', label: 'Venue Name', type: 'text', required: true },
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'venue_type', label: 'Venue Type', type: 'text' }
          ],
          location: [
            { key: 'address', label: 'Address', type: 'text' },
            { key: 'city', label: 'City', type: 'text' },
            { key: 'country', label: 'Country', type: 'text' },
            { key: 'latitude', label: 'Latitude', type: 'number' },
            { key: 'longitude', label: 'Longitude', type: 'number' }
          ],
          contact: [
            { key: 'phone', label: 'Phone', type: 'tel' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'website', label: 'Website', type: 'url' }
          ]
        };
      case 'news_articles':
        return {
          basic: [
            { key: 'title', label: 'Article Title', type: 'text', required: true },
            { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
            { key: 'content', label: 'Article Content', type: 'textarea' }
          ],
          meta: [
            { key: 'author', label: 'Author', type: 'text' },
            { key: 'category', label: 'Category', type: 'text' },
            { key: 'published_at', label: 'Published Date', type: 'datetime-local' }
          ],
          media: [
            { key: 'image_url', label: 'Featured Image', type: 'url' },
            { key: 'source_url', label: 'Source URL', type: 'url' }
          ]
        };
      default:
        return {
          basic: [
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'description', label: 'Description', type: 'textarea' }
          ]
        };
    }
  };

  const renderField = (field: { key: string; label: string; type: string; required?: boolean; options?: string[] }) => {
    const { key, label, type, required, options } = field;
    const fieldValue = formData[key];

    switch (type) {
      case 'text':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key}>
              {label}
              {required && <span style={{ color: 'var(--destructive)' }}> *</span>}
            </Label>
            <Input
              id={key}
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              required={required}
            />
          </Box>
        );
      case 'textarea':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key}>
              {label}
              {required && <span style={{ color: 'var(--destructive)' }}> *</span>}
            </Label>
            <Textarea
              id={key}
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              style={{ minHeight: 96 }}
              required={required}
            />
          </Box>
        );
      case 'select':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key}>
              {label}
              {required && <span style={{ color: 'var(--destructive)' }}> *</span>}
            </Label>
            <Select value={fieldValue || ''} onValueChange={(value) => handleFieldChange(key, value)}>
              <SelectTrigger>
                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {options?.map((option: string) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
        );
      case 'boolean':
        return (
          <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch
              id={key}
              checked={fieldValue || false}
              onCheckedChange={(checked) => handleFieldChange(key, checked)}
            />
            <Label htmlFor={key}>{label}</Label>
          </Box>
        );
      case 'number':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key}>
              {label}
              {required && <span style={{ color: 'var(--destructive)' }}> *</span>}
            </Label>
            <Input
              id={key}
              type="number"
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value ? Number(e.target.value) : null)}
              required={required}
            />
          </Box>
        );
      case 'email':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key}>
              {label}
              {required && <span style={{ color: 'var(--destructive)' }}> *</span>}
            </Label>
            <Input
              id={key}
              type="email"
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              required={required}
            />
          </Box>
        );
      case 'tel':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key}>
              {label}
              {required && <span style={{ color: 'var(--destructive)' }}> *</span>}
            </Label>
            <Input
              id={key}
              type="tel"
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              required={required}
            />
          </Box>
        );
      case 'url':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key}>
              {label}
              {required && <span style={{ color: 'var(--destructive)' }}> *</span>}
            </Label>
            <Input
              id={key}
              type="url"
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              required={required}
            />
          </Box>
        );
      case 'datetime-local':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key}>
              {label}
              {required && <span style={{ color: 'var(--destructive)' }}> *</span>}
            </Label>
            <Input
              id={key}
              type="datetime-local"
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              required={required}
            />
          </Box>
        );
      default:
        return null;
    }
  };

  const formFields = getFormFields();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Plus style={{ height: 16, width: 16 }} />
            Create Content
          </Box>
        </Button>
      </DialogTrigger>
      <DialogContent style={{ maxWidth: 896, maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Plus style={{ height: 20, width: 20 }} />
              Create New Content
            </Box>
          </DialogTitle>
          <DialogDescription>
            Select a content type and fill in the required information to create new content.
          </DialogDescription>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Content Type Selection */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label>Content Type</Label>
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger>
                <SelectValue placeholder="Select content type" />
              </SelectTrigger>
              <SelectContent>
                {contentTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {type.icon}
                      {type.label}
                    </Box>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          {/* Form Fields */}
          {contentType && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {Object.keys(formFields).map((tab) => (
                    <TabsTrigger key={tab} value={tab} style={{ textTransform: 'capitalize' }}>
                      {tab}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {Object.entries(formFields).map(([tabName, fields]) => (
                  <TabsContent key={tabName} value={tabName}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                      {fields.map(renderField)}
                    </Box>
                  </TabsContent>
                ))}
              </Box>
            </Tabs>
          )}

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setIsOpen(false);
              }}
            >
              <X style={{ height: 16, width: 16, marginRight: 8 }} />
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={loading || !contentType}
            >
              <Save style={{ height: 16, width: 16, marginRight: 8 }} />
              {loading ? 'Creating...' : 'Create Content'}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
