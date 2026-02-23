import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Eye, Trash2, Upload, Plus, X, MapPin, Clock, Users, Tag, Globe, Calendar, User, Building, Star } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ProfessionAutocomplete } from '@/components/ui/profession-autocomplete';
import { CountryAutocomplete } from '@/components/ui/country-autocomplete';
import { ImageUpload } from '@/components/ui/image-upload';
import { AutoTagPanel } from '@/components/cms/AutoTagPanel';
import { GeoLinkPanel } from '@/components/cms/GeoLinkPanel';

interface UniversalContentEditorProps {
  content: any;
  onClose: () => void;
}

export function UniversalContentEditor({ content, onClose }: UniversalContentEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [originalData, setOriginalData] = useState<any>({});
  const [activeTab, setActiveTab] = useState('basic');

  useEffect(() => {
    if (content) {
      // Create a copy for editing
      const editableData = { ...content };
      setFormData(editableData);
      setOriginalData(editableData);
    }
  }, [content]);

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to save changes",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const tableName = content.content_type;
      const changes = {};
      
      // Only include changed fields
      Object.keys(formData).forEach(key => {
        if (formData[key] !== originalData[key] && key !== 'content_type' && key !== 'id') {
          changes[key] = formData[key];
        }
      });

      if (Object.keys(changes).length === 0) {
        toast({
          title: "No changes",
          description: "No changes were made to save",
        });
        setLoading(false);
        return;
      }

      // Add updated_at timestamp
      changes['updated_at'] = new Date().toISOString();

      const { error } = await supabase
        .from(tableName)
        .update(changes)
        .eq('id', content.id);

      if (error) throw error;

      toast({
        title: "Content updated",
        description: "Your changes have been saved successfully",
      });

      onClose();
    } catch (error) {
      console.error('Error saving content:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to save changes',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Content type specific field configurations
  const getFieldGroups = () => {
    const contentType = content.content_type;
    
    switch (contentType) {
      case 'events':
        return {
          basic: [
            { key: 'name', label: 'Event Name', type: 'text', required: true, icon: <Calendar style={{ height: 16, width: 16 }} /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'event_type', label: 'Event Type', type: 'text', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'cancelled'], icon: <Star style={{ height: 16, width: 16 }} /> }
          ],
          datetime: [
            { key: 'start_date', label: 'Start Date', type: 'datetime', icon: <Clock style={{ height: 16, width: 16 }} /> },
            { key: 'end_date', label: 'End Date', type: 'datetime', icon: <Clock style={{ height: 16, width: 16 }} /> },
            { key: 'is_recurring', label: 'Recurring Event', type: 'boolean', icon: <Clock style={{ height: 16, width: 16 }} /> }
          ],
          location: [
            { key: 'venue_id', label: 'Venue', type: 'text', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'address', label: 'Address', type: 'text', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'latitude', label: 'Latitude', type: 'number', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'longitude', label: 'Longitude', type: 'number', icon: <MapPin style={{ height: 16, width: 16 }} /> }
          ],
          details: [
            { key: 'price', label: 'Price', type: 'number', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'capacity', label: 'Capacity', type: 'number', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'age_restriction', label: 'Age Restriction', type: 'text', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'website', label: 'Website', type: 'url', icon: <Globe style={{ height: 16, width: 16 }} /> },
            { key: 'image_url', label: 'Image URL', type: 'url', icon: <Upload style={{ height: 16, width: 16 }} /> }
          ]
        };
        
      case 'venues':
        return {
          basic: [
            { key: 'name', label: 'Venue Name', type: 'text', required: true, icon: <Building style={{ height: 16, width: 16 }} /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'venue_type', label: 'Venue Type', type: 'text', icon: <Building style={{ height: 16, width: 16 }} /> },
            { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'temporarily_closed'], icon: <Star style={{ height: 16, width: 16 }} /> }
          ],
          location: [
            { key: 'address', label: 'Address', type: 'text', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'city', label: 'City', type: 'text', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'country', label: 'Country', type: 'text', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'latitude', label: 'Latitude', type: 'number', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'longitude', label: 'Longitude', type: 'number', icon: <MapPin style={{ height: 16, width: 16 }} /> }
          ],
          contact: [
            { key: 'phone', label: 'Phone', type: 'tel', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'email', label: 'Email', type: 'email', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'website', label: 'Website', type: 'url', icon: <Globe style={{ height: 16, width: 16 }} /> },
            { key: 'social_media', label: 'Social Media', type: 'json', icon: <Globe style={{ height: 16, width: 16 }} /> }
          ],
          details: [
            { key: 'capacity', label: 'Capacity', type: 'number', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'accessibility_features', label: 'Accessibility Features', type: 'array', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'amenities', label: 'Amenities', type: 'array', icon: <Star style={{ height: 16, width: 16 }} /> },
            { key: 'image_url', label: 'Image URL', type: 'url', icon: <Upload style={{ height: 16, width: 16 }} /> }
          ]
        };

      case 'personalities':
        return {
          basic: [
            { key: 'name', label: 'Name', type: 'text', required: true, icon: <User style={{ height: 16, width: 16 }} /> },
            { key: 'bio', label: 'Biography', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'profession', label: 'Profession', type: 'text', icon: <Building style={{ height: 16, width: 16 }} /> },
            { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'], icon: <Star style={{ height: 16, width: 16 }} /> }
          ],
          personal: [
            { key: 'birth_date', label: 'Birth Date', type: 'date', icon: <Calendar style={{ height: 16, width: 16 }} /> },
            { key: 'death_date', label: 'Death Date', type: 'date', icon: <Calendar style={{ height: 16, width: 16 }} /> },
            { key: 'nationality', label: 'Nationality', type: 'text', icon: <Globe style={{ height: 16, width: 16 }} /> },
            { key: 'gender', label: 'Gender', type: 'text', icon: <User style={{ height: 16, width: 16 }} /> }
          ],
          media: [
            { key: 'image_url', label: 'Profile Image', type: 'url', icon: <Upload style={{ height: 16, width: 16 }} /> },
            { key: 'website', label: 'Website', type: 'url', icon: <Globe style={{ height: 16, width: 16 }} /> },
            { key: 'social_links', label: 'Social Links', type: 'json', icon: <Globe style={{ height: 16, width: 16 }} /> }
          ],
          metadata: [
            { key: 'tags', label: 'Tags', type: 'array', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'categories', label: 'Categories', type: 'array', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'view_count', label: 'View Count', type: 'number', readonly: true, icon: <Eye style={{ height: 16, width: 16 }} /> }
          ]
        };

      case 'community_groups':
        return {
          basic: [
            { key: 'name', label: 'Group Name', type: 'text', required: true, icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'rules', label: 'Group Rules', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> }
          ],
          settings: [
            { key: 'is_private', label: 'Private Group', type: 'boolean', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'member_count', label: 'Member Count', type: 'number', readonly: true, icon: <Users style={{ height: 16, width: 16 }} /> }
          ],
          media: [
            { key: 'image_url', label: 'Group Image', type: 'url', icon: <Upload style={{ height: 16, width: 16 }} /> },
            { key: 'tags', label: 'Tags', type: 'array', icon: <Tag style={{ height: 16, width: 16 }} /> }
          ]
        };

      case 'community_posts':
        return {
          basic: [
            { key: 'content', label: 'Post Content', type: 'textarea', required: true, icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'post_type', label: 'Post Type', type: 'select', options: ['text', 'image', 'link', 'poll'], icon: <Tag style={{ height: 16, width: 16 }} /> }
          ],
          settings: [
            { key: 'visibility', label: 'Visibility', type: 'select', options: ['public', 'private', 'friends'], icon: <Eye style={{ height: 16, width: 16 }} /> },
            { key: 'pinned', label: 'Pinned Post', type: 'boolean', icon: <Star style={{ height: 16, width: 16 }} /> }
          ],
          engagement: [
            { key: 'likes_count', label: 'Likes', type: 'number', readonly: true, icon: <Star style={{ height: 16, width: 16 }} /> },
            { key: 'comments_count', label: 'Comments', type: 'number', readonly: true, icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'shares_count', label: 'Shares', type: 'number', readonly: true, icon: <Globe style={{ height: 16, width: 16 }} /> }
          ],
          media: [
            { key: 'images', label: 'Images', type: 'array', icon: <Upload style={{ height: 16, width: 16 }} /> },
            { key: 'link_url', label: 'Link URL', type: 'url', icon: <Globe style={{ height: 16, width: 16 }} /> },
            { key: 'tags', label: 'Tags', type: 'array', icon: <Tag style={{ height: 16, width: 16 }} /> }
          ]
        };

      case 'cms_content':
        return {
          basic: [
            { key: 'title', label: 'Title', type: 'text', required: true, icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'content_type', label: 'Content Type', type: 'select', options: ['page', 'article', 'blog_post'], icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'workflow_state', label: 'Workflow State', type: 'select', options: ['draft', 'review', 'published', 'archived'], icon: <Star style={{ height: 16, width: 16 }} /> }
          ],
          settings: [
            { key: 'visibility_level', label: 'Visibility', type: 'select', options: ['public', 'private', 'restricted'], icon: <Eye style={{ height: 16, width: 16 }} /> },
            { key: 'featured_weight', label: 'Featured Weight', type: 'number', icon: <Star style={{ height: 16, width: 16 }} /> }
          ],
          meta: [
            { key: 'meta_title', label: 'Meta Title', type: 'text', icon: <Globe style={{ height: 16, width: 16 }} /> },
            { key: 'meta_description', label: 'Meta Description', type: 'textarea', icon: <Globe style={{ height: 16, width: 16 }} /> },
            { key: 'slug', label: 'URL Slug', type: 'text', icon: <Globe style={{ height: 16, width: 16 }} /> },
            { key: 'tags', label: 'Tags', type: 'array', icon: <Tag style={{ height: 16, width: 16 }} /> }
          ]
        };

      case 'news_articles':
        return {
          basic: [
            { key: 'title', label: 'Article Title', type: 'text', required: true, icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'excerpt', label: 'Excerpt', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'content', label: 'Article Content', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> }
          ],
          meta: [
            { key: 'author', label: 'Author', type: 'text', icon: <User style={{ height: 16, width: 16 }} /> },
            { key: 'category', label: 'Category', type: 'text', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'status', label: 'Status', type: 'select', options: ['draft', 'published', 'archived'], icon: <Star style={{ height: 16, width: 16 }} /> },
            { key: 'published_at', label: 'Published Date', type: 'datetime', icon: <Calendar style={{ height: 16, width: 16 }} /> }
          ],
          media: [
            { key: 'image_url', label: 'Featured Image', type: 'url', icon: <Upload style={{ height: 16, width: 16 }} /> },
            { key: 'source_url', label: 'Source URL', type: 'url', icon: <Globe style={{ height: 16, width: 16 }} /> }
          ],
          settings: [
            { key: 'is_featured', label: 'Featured Article', type: 'boolean', icon: <Star style={{ height: 16, width: 16 }} /> },
            { key: 'views_count', label: 'Views', type: 'number', readonly: true, icon: <Eye style={{ height: 16, width: 16 }} /> },
            { key: 'tags', label: 'Tags', type: 'array', icon: <Tag style={{ height: 16, width: 16 }} /> }
          ]
        };

      case 'tags':
        return {
          basic: [
            { key: 'name', label: 'Tag Name', type: 'text', required: true, icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'category', label: 'Category', type: 'text', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'slug', label: 'URL Slug', type: 'text', icon: <Globe style={{ height: 16, width: 16 }} /> }
          ],
          appearance: [
            { key: 'color', label: 'Tag Color', type: 'text', icon: <Star style={{ height: 16, width: 16 }} /> },
            { key: 'image_url', label: 'Tag Image', type: 'url', icon: <Upload style={{ height: 16, width: 16 }} /> }
          ],
          metadata: [
            { key: 'usage_count', label: 'Usage Count', type: 'number', readonly: true, icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'wikipedia_url', label: 'Wikipedia URL', type: 'url', icon: <Globe style={{ height: 16, width: 16 }} /> }
          ]
        };

      case 'cities':
        return {
          basic: [
            { key: 'name', label: 'City Name', type: 'text', required: true, icon: <Building style={{ height: 16, width: 16 }} /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'region_name', label: 'Region', type: 'text', icon: <MapPin style={{ height: 16, width: 16 }} /> }
          ],
          location: [
            { key: 'latitude', label: 'Latitude', type: 'number', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'longitude', label: 'Longitude', type: 'number', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'timezone', label: 'Timezone', type: 'text', icon: <Clock style={{ height: 16, width: 16 }} /> }
          ],
          details: [
            { key: 'population', label: 'Population', type: 'number', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'is_capital', label: 'Is Capital', type: 'boolean', icon: <Star style={{ height: 16, width: 16 }} /> },
            { key: 'is_major_city', label: 'Is Major City', type: 'boolean', icon: <Star style={{ height: 16, width: 16 }} /> },
            { key: 'image_url', label: 'City Image', type: 'url', icon: <Upload style={{ height: 16, width: 16 }} /> }
          ]
        };

      case 'countries':
        return {
          basic: [
            { key: 'name', label: 'Country Name', type: 'text', required: true, icon: <Globe style={{ height: 16, width: 16 }} /> },
            { key: 'code', label: 'Country Code', type: 'text', icon: <Globe style={{ height: 16, width: 16 }} /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'capital', label: 'Capital City', type: 'text', icon: <Building style={{ height: 16, width: 16 }} /> }
          ],
          details: [
            { key: 'population', label: 'Population', type: 'number', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'area_km2', label: 'Area (km²)', type: 'number', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'currency', label: 'Currency', type: 'text', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'languages', label: 'Languages', type: 'array', icon: <Globe style={{ height: 16, width: 16 }} /> }
          ],
          location: [
            { key: 'latitude', label: 'Latitude', type: 'number', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'longitude', label: 'Longitude', type: 'number', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'timezone', label: 'Timezone', type: 'text', icon: <Clock style={{ height: 16, width: 16 }} /> }
          ]
        };

      case 'marketplace_listings':
        return {
          basic: [
            { key: 'title', label: 'Listing Title', type: 'text', required: true, icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'business_name', label: 'Business Name', type: 'text', icon: <Building style={{ height: 16, width: 16 }} /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'category', label: 'Category', type: 'text', icon: <Tag style={{ height: 16, width: 16 }} /> }
          ],
          pricing: [
            { key: 'price', label: 'Price', type: 'number', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'currency', label: 'Currency', type: 'text', icon: <Tag style={{ height: 16, width: 16 }} /> },
            { key: 'business_type', label: 'Business Type', type: 'text', icon: <Building style={{ height: 16, width: 16 }} /> }
          ],
          contact: [
            { key: 'contact_email', label: 'Contact Email', type: 'email', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'contact_phone', label: 'Contact Phone', type: 'tel', icon: <Users style={{ height: 16, width: 16 }} /> },
            { key: 'website', label: 'Website', type: 'url', icon: <Globe style={{ height: 16, width: 16 }} /> }
          ],
          details: [
            { key: 'location', label: 'Location', type: 'text', icon: <MapPin style={{ height: 16, width: 16 }} /> },
            { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'pending'], icon: <Star style={{ height: 16, width: 16 }} /> },
            { key: 'images', label: 'Images', type: 'array', icon: <Upload style={{ height: 16, width: 16 }} /> }
          ]
        };

      default:
        // Create comprehensive field groups for unknown content types
        const allFields = Object.keys(formData).filter(key => !['id', 'created_at', 'updated_at', 'content_type'].includes(key));
        
        // Group fields by common patterns
        const basicFields = allFields.filter(key => 
          ['name', 'title', 'description', 'bio', 'content', 'slug', 'type', 'category', 'status'].some(pattern => key.includes(pattern))
        );
        
        const locationFields = allFields.filter(key => 
          ['latitude', 'longitude', 'address', 'city', 'country', 'location', 'timezone', 'region'].some(pattern => key.includes(pattern))
        );
        
        const mediaFields = allFields.filter(key => 
          ['image_url', 'images', 'video', 'audio', 'media', 'avatar', 'photo', 'picture'].some(pattern => key.includes(pattern))
        );
        
        const contactFields = allFields.filter(key => 
          ['email', 'phone', 'website', 'social', 'contact'].some(pattern => key.includes(pattern))
        );
        
        const metaFields = allFields.filter(key => 
          ['tags', 'categories', 'meta_', 'seo_', 'keywords', 'featured', 'priority', 'weight', 'order'].some(pattern => key.includes(pattern))
        );
        
        const statsFields = allFields.filter(key => 
          ['count', 'views', 'likes', 'shares', 'rating', 'score', 'popularity', 'usage'].some(pattern => key.includes(pattern))
        );
        
        const dateFields = allFields.filter(key => 
          ['_at', '_date', 'published', 'expires', 'start', 'end', 'birth', 'death'].some(pattern => key.includes(pattern))
        );
        
        const otherFields = allFields.filter(key => 
          ![...basicFields, ...locationFields, ...mediaFields, ...contactFields, ...metaFields, ...statsFields, ...dateFields].includes(key)
        );
        
        const fieldGroups: any = {};
        
        if (basicFields.length > 0) {
          fieldGroups.basic = basicFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Tag style={{ height: 16, width: 16 }} /> 
          }));
        }
        
        if (locationFields.length > 0) {
          fieldGroups.location = locationFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <MapPin style={{ height: 16, width: 16 }} /> 
          }));
        }
        
        if (contactFields.length > 0) {
          fieldGroups.contact = contactFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Users style={{ height: 16, width: 16 }} /> 
          }));
        }
        
        if (mediaFields.length > 0) {
          fieldGroups.media = mediaFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Upload style={{ height: 16, width: 16 }} /> 
          }));
        }
        
        if (dateFields.length > 0) {
          fieldGroups.dates = dateFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Calendar style={{ height: 16, width: 16 }} /> 
          }));
        }
        
        if (metaFields.length > 0) {
          fieldGroups.metadata = metaFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Tag style={{ height: 16, width: 16 }} /> 
          }));
        }
        
        if (statsFields.length > 0) {
          fieldGroups.statistics = statsFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Star style={{ height: 16, width: 16 }} />,
            readonly: true // Stats are usually read-only
          }));
        }
        
        if (otherFields.length > 0) {
          fieldGroups.other = otherFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Tag style={{ height: 16, width: 16 }} /> 
          }));
        }
        
        // If no fields were categorized, put everything in basic
        if (Object.keys(fieldGroups).length === 0) {
          fieldGroups.basic = allFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Tag style={{ height: 16, width: 16 }} /> 
          }));
        }
        
        return fieldGroups;
    }
  };

  const renderField = (field: any) => {
    const { key, label, type, required, readonly, options, icon } = field;
    const fieldValue = formData[key];

    if (readonly) {
      return (
        <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Label sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {icon}
            {label}
            <Badge variant="secondary" sx={{ fontSize: '0.75rem' }}>Read-only</Badge>
          </Label>
          <Box sx={{ px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.875rem' }}>
            {fieldValue?.toLocaleString() || 'N/A'}
          </Box>
        </Box>
      );
    }

    // Handle different field types based on configuration
    switch (type) {
      case 'text':
        // Special handling for profession field
        if (key === 'profession') {
          return (
            <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {icon}
                {label}
                {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
              </Label>
              <ProfessionAutocomplete
                id={key}
                value={fieldValue || ''}
                onValueChange={(value) => handleFieldChange(key, value)}
                placeholder="Select or type a profession..."
                required={required}
              />
            </Box>
          );
        }
        
        // Special handling for nationality field
        if (key === 'nationality') {
          return (
            <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {icon}
                {label}
                {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
              </Label>
              <CountryAutocomplete
                id={key}
                value={fieldValue || ''}
                onValueChange={(value) => handleFieldChange(key, value)}
                placeholder="Select a country..."
                required={required}
              />
            </Box>
          );
        }
        
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
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
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
            </Label>
            <Textarea
              id={key}
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              sx={{ minHeight: 96 }}
              required={required}
            />
          </Box>
        );

      case 'number':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
            </Label>
            <Input
              id={key}
              type="number"
              value={fieldValue !== null && fieldValue !== undefined ? fieldValue : ''}
              onChange={(e) => handleFieldChange(key, e.target.value ? Number(e.target.value) : null)}
              required={required}
            />
          </Box>
        );

      case 'email':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
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
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
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
        // Special handling for image URLs
        if (key === 'image_url' || key.includes('image')) {
          return (
            <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <ImageUpload
                id={key}
                value={fieldValue || ''}
                onValueChange={(value) => handleFieldChange(key, value)}
                label={label}
                required={required}
                maxSize={5}
              />
            </Box>
          );
        }
        
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
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

      case 'date':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
            </Label>
            <Input
              id={key}
              type="date"
              value={fieldValue ? (fieldValue instanceof Date ? fieldValue.toISOString().split('T')[0] : new Date(fieldValue).toISOString().split('T')[0]) : ''}
              onChange={(e) => handleFieldChange(key, e.target.value ? new Date(e.target.value).toISOString() : null)}
              required={required}
            />
          </Box>
        );

      case 'datetime':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
            </Label>
            <Input
              id={key}
              type="datetime-local"
              value={fieldValue ? (fieldValue instanceof Date ? fieldValue.toISOString().slice(0, 16) : new Date(fieldValue).toISOString().slice(0, 16)) : ''}
              onChange={(e) => handleFieldChange(key, e.target.value ? new Date(e.target.value).toISOString() : null)}
              required={required}
            />
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
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
            </Label>
          </Box>
        );

      case 'select':
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
            </Label>
            <Select value={fieldValue || ''} onValueChange={(value) => handleFieldChange(key, value)}>
              <SelectTrigger>
                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent sx={{ bgcolor: 'background.default', border: 1, borderColor: 'divider', boxShadow: 6, zIndex: 50 }}>
                {options?.filter((option: string) => option && option.trim() !== '').map((option: string) => (
                  <SelectItem key={option} value={option} sx={{ textTransform: 'capitalize' }}>
                    {option.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
        );

      case 'array':
        // Handle different array data formats
        let displayValue = '';
        if (fieldValue) {
          if (Array.isArray(fieldValue)) {
            displayValue = fieldValue.join(', ');
          } else if (typeof fieldValue === 'string') {
            try {
              // Try to parse as JSON array first
              const parsed = JSON.parse(fieldValue);
              if (Array.isArray(parsed)) {
                displayValue = parsed.join(', ');
              } else {
                displayValue = fieldValue;
              }
            } catch {
              // If not JSON, treat as comma-separated string
              displayValue = fieldValue;
            }
          } else if (typeof fieldValue === 'object') {
            // Handle objects that might contain array-like data
            displayValue = Object.values(fieldValue).join(', ');
          }
        }
        
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
            </Label>
            <Textarea
              id={key}
              value={displayValue}
              onChange={(e) => {
                const items = e.target.value.split(',').map(item => item.trim()).filter(Boolean);
                handleFieldChange(key, items);
              }}
              placeholder="Enter comma-separated values"
              sx={{ minHeight: 96 }}
            />
            {displayValue && (
              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                Current: {displayValue.split(',').length} item(s)
              </Box>
            )}
          </Box>
        );

      case 'json':
        // Handle different JSON data formats
        let jsonDisplayValue = '';
        if (fieldValue) {
          if (typeof fieldValue === 'object') {
            jsonDisplayValue = JSON.stringify(fieldValue, null, 2);
          } else if (typeof fieldValue === 'string') {
            try {
              // Try to parse and format as JSON
              const parsed = JSON.parse(fieldValue);
              jsonDisplayValue = JSON.stringify(parsed, null, 2);
            } catch {
              // Keep as string if not valid JSON
              jsonDisplayValue = fieldValue;
            }
          } else {
            jsonDisplayValue = String(fieldValue);
          }
        }
        
        return (
          <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon}
              {label}
              {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
            </Label>
            <Textarea
              id={key}
              value={jsonDisplayValue}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  handleFieldChange(key, parsed);
                } catch {
                  // Keep as string if invalid JSON
                  handleFieldChange(key, e.target.value);
                }
              }}
              sx={{ minHeight: 96, fontFamily: 'monospace', fontSize: '0.875rem' }}
              placeholder="Enter JSON data"
            />
            {jsonDisplayValue && (
              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {jsonDisplayValue.length > 100 ? `${jsonDisplayValue.length} characters` : 'Valid JSON'}
              </Box>
            )}
          </Box>
        );

      default:
        // Auto-detect type
        if (typeof fieldValue === 'boolean') {
          return renderField({ ...field, type: 'boolean' });
        }
        if (typeof fieldValue === 'number') {
          return renderField({ ...field, type: 'number' });
        }
        if (Array.isArray(fieldValue)) {
          return renderField({ ...field, type: 'array' });
        }
        if (typeof fieldValue === 'object' && fieldValue !== null) {
          return renderField({ ...field, type: 'json' });
        }
        if (key.includes('_at') || key.includes('date')) {
          return renderField({ ...field, type: key.includes('_at') ? 'datetime' : 'date' });
        }
        if (key.includes('email')) {
          return renderField({ ...field, type: 'email' });
        }
        if (key.includes('url') || key.includes('website')) {
          return renderField({ ...field, type: 'url' });
        }
        if (key.includes('phone')) {
          return renderField({ ...field, type: 'tel' });
        }
        if (typeof fieldValue === 'string' && fieldValue.length > 100) {
          return renderField({ ...field, type: 'textarea' });
        }
        return renderField({ ...field, type: 'text' });
    }
  };

  const fieldGroups = getFieldGroups();
  const tabs = Object.keys(fieldGroups);

  if (!content) {
    return (
      <Card>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <p style={{ color: 'var(--muted-foreground)' }}>No content selected for editing</p>
          <Button onClick={onClose} sx={{ mt: 2 }}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="ghost" onClick={onClose}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            Back
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {content.image_url && (
              <Avatar style={{ height: 48, width: 48 }}>
                <AvatarImage src={content.image_url} alt={content.title} />
                <AvatarFallback>
                  {content.content_type === 'events' && <Calendar style={{ height: 24, width: 24 }} />}
                  {content.content_type === 'venues' && <Building style={{ height: 24, width: 24 }} />}
                  {content.content_type === 'personalities' && <User style={{ height: 24, width: 24 }} />}
                  {content.content_type === 'community_groups' && <Users style={{ height: 24, width: 24 }} />}
                  {content.content_type === 'community_posts' && <Tag style={{ height: 24, width: 24 }} />}
                </AvatarFallback>
              </Avatar>
            )}
            <div>
              <Typography variant="h1" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{content.title || content.name || 'Edit Content'}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Badge variant="outline" sx={{ textTransform: 'capitalize' }}>
                  {content.content_type.replace('_', ' ')}
                </Badge>
                <Box component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>ID: {content.id}</Box>
              </Box>
            </div>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outline" disabled>
            <Eye style={{ height: 16, width: 16, marginRight: 8 }} />
            Preview
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            <Save style={{ height: 16, width: 16, marginRight: 8 }} />
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Box>

      <Separator />

      {/* Content Form with Tabs */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(4, 1fr)' }, gap: 3 }}>
        <Box sx={{ gridColumn: { lg: 'span 3' } }}>
          <Card>
            <CardHeader>
              <CardTitle>Content Details</CardTitle>
              <CardDescription>
                Edit the content fields below. Fields marked with * are required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList sx={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  {tabs.map(tab => (
                    <TabsTrigger key={tab} value={tab} sx={{ textTransform: 'capitalize' }}>
                      {tab === 'basic' && <Tag style={{ height: 16, width: 16, marginRight: 8 }} />}
                      {tab === 'datetime' && <Clock style={{ height: 16, width: 16, marginRight: 8 }} />}
                      {tab === 'location' && <MapPin style={{ height: 16, width: 16, marginRight: 8 }} />}
                      {tab === 'contact' && <Users style={{ height: 16, width: 16, marginRight: 8 }} />}
                      {tab === 'details' && <Star style={{ height: 16, width: 16, marginRight: 8 }} />}
                      {tab === 'personal' && <User style={{ height: 16, width: 16, marginRight: 8 }} />}
                      {tab === 'media' && <Upload style={{ height: 16, width: 16, marginRight: 8 }} />}
                      {tab === 'metadata' && <Tag style={{ height: 16, width: 16, marginRight: 8 }} />}
                      {tab === 'settings' && <Star style={{ height: 16, width: 16, marginRight: 8 }} />}
                      {tab === 'engagement' && <Users style={{ height: 16, width: 16, marginRight: 8 }} />}
                      {tab.replace('_', ' ')}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {tabs.map(tab => (
                  <TabsContent key={tab} value={tab} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 3 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                      {fieldGroups[tab]?.map(field => renderField(field))}
                    </Box>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Content Info */}
          <Card>
            <CardHeader>
              <CardTitle>Content Information</CardTitle>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div>
                <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Content Type</Label>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', textTransform: 'capitalize' }}>
                  {content.content_type.replace('_', ' ')}
                </Typography>
              </div>
              
              <div>
                <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Created</Label>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                  {new Date(content.created_at).toLocaleString()}
                </Typography>
              </div>
              
              <div>
                <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Last Updated</Label>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                  {new Date(content.updated_at).toLocaleString()}
                </Typography>
              </div>

              {content.status && (
                <div>
                  <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Status</Label>
                  <Badge sx={{ ml: 1 }} variant={content.status === 'active' ? 'default' : 'secondary'}>
                    {content.status}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button variant="outline" size="sm" sx={{ width: '100%' }} disabled>
                <Eye style={{ height: 16, width: 16, marginRight: 8 }} />
                View Public Page
              </Button>
              <Button variant="outline" size="sm" sx={{ width: '100%' }} disabled>
                <Upload style={{ height: 16, width: 16, marginRight: 8 }} />
                Upload Media
              </Button>
              <Button variant="outline" size="sm" sx={{ width: '100%', color: 'error.main' }} disabled>
                <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                Delete Content
              </Button>
            </CardContent>
          </Card>

          {/* AI Tag Suggestions */}
          {content?.id && content?.content_type && (
            <AutoTagPanel
              contentType={content.content_type}
              contentId={content.id}
            />
          )}

          {/* Geo Location Linking */}
          {content?.id && content?.content_type && (
            <GeoLinkPanel
              contentType={content.content_type}
              contentId={content.id}
              cityName={content.city || content.birth_place}
              countryName={content.country || content.nationality}
              hasCityId={!!content.city_id}
              hasCountryId={!!content.country_id}
            />
          )}

          {/* Raw Data Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Raw Data</CardTitle>
              <CardDescription>
                Original data structure for debugging
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea sx={{ height: 192 }}>
                <Box component="pre" sx={{ fontSize: '0.75rem', bgcolor: 'action.hover', p: 1, borderRadius: 1, overflow: 'auto' }}>
                  {JSON.stringify(content, null, 2)}
                </Box>
              </ScrollArea>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
