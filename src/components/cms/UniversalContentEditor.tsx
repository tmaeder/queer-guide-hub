import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Eye, Trash2, Upload, Plus, X, MapPin, Clock, Users, Tag, Globe, Calendar, User, Building, Star } from 'lucide-react';
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
            { key: 'name', label: 'Event Name', type: 'text', required: true, icon: <Calendar className="h-4 w-4" /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'event_type', label: 'Event Type', type: 'text', icon: <Tag className="h-4 w-4" /> },
            { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'cancelled'], icon: <Star className="h-4 w-4" /> }
          ],
          datetime: [
            { key: 'start_date', label: 'Start Date', type: 'datetime', icon: <Clock className="h-4 w-4" /> },
            { key: 'end_date', label: 'End Date', type: 'datetime', icon: <Clock className="h-4 w-4" /> },
            { key: 'is_recurring', label: 'Recurring Event', type: 'boolean', icon: <Clock className="h-4 w-4" /> }
          ],
          location: [
            { key: 'venue_id', label: 'Venue', type: 'text', icon: <MapPin className="h-4 w-4" /> },
            { key: 'address', label: 'Address', type: 'text', icon: <MapPin className="h-4 w-4" /> },
            { key: 'latitude', label: 'Latitude', type: 'number', icon: <MapPin className="h-4 w-4" /> },
            { key: 'longitude', label: 'Longitude', type: 'number', icon: <MapPin className="h-4 w-4" /> }
          ],
          details: [
            { key: 'price', label: 'Price', type: 'number', icon: <Tag className="h-4 w-4" /> },
            { key: 'capacity', label: 'Capacity', type: 'number', icon: <Users className="h-4 w-4" /> },
            { key: 'age_restriction', label: 'Age Restriction', type: 'text', icon: <Users className="h-4 w-4" /> },
            { key: 'website', label: 'Website', type: 'url', icon: <Globe className="h-4 w-4" /> },
            { key: 'image_url', label: 'Image URL', type: 'url', icon: <Upload className="h-4 w-4" /> }
          ]
        };
        
      case 'venues':
        return {
          basic: [
            { key: 'name', label: 'Venue Name', type: 'text', required: true, icon: <Building className="h-4 w-4" /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'venue_type', label: 'Venue Type', type: 'text', icon: <Building className="h-4 w-4" /> },
            { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'temporarily_closed'], icon: <Star className="h-4 w-4" /> }
          ],
          location: [
            { key: 'address', label: 'Address', type: 'text', icon: <MapPin className="h-4 w-4" /> },
            { key: 'city', label: 'City', type: 'text', icon: <MapPin className="h-4 w-4" /> },
            { key: 'country', label: 'Country', type: 'text', icon: <MapPin className="h-4 w-4" /> },
            { key: 'latitude', label: 'Latitude', type: 'number', icon: <MapPin className="h-4 w-4" /> },
            { key: 'longitude', label: 'Longitude', type: 'number', icon: <MapPin className="h-4 w-4" /> }
          ],
          contact: [
            { key: 'phone', label: 'Phone', type: 'tel', icon: <Users className="h-4 w-4" /> },
            { key: 'email', label: 'Email', type: 'email', icon: <Users className="h-4 w-4" /> },
            { key: 'website', label: 'Website', type: 'url', icon: <Globe className="h-4 w-4" /> },
            { key: 'social_media', label: 'Social Media', type: 'json', icon: <Globe className="h-4 w-4" /> }
          ],
          details: [
            { key: 'capacity', label: 'Capacity', type: 'number', icon: <Users className="h-4 w-4" /> },
            { key: 'accessibility_features', label: 'Accessibility Features', type: 'array', icon: <Users className="h-4 w-4" /> },
            { key: 'amenities', label: 'Amenities', type: 'array', icon: <Star className="h-4 w-4" /> },
            { key: 'image_url', label: 'Image URL', type: 'url', icon: <Upload className="h-4 w-4" /> }
          ]
        };

      case 'personalities':
        return {
          basic: [
            { key: 'name', label: 'Name', type: 'text', required: true, icon: <User className="h-4 w-4" /> },
            { key: 'bio', label: 'Biography', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'profession', label: 'Profession', type: 'text', icon: <Building className="h-4 w-4" /> },
            { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'], icon: <Star className="h-4 w-4" /> }
          ],
          personal: [
            { key: 'birth_date', label: 'Birth Date', type: 'date', icon: <Calendar className="h-4 w-4" /> },
            { key: 'death_date', label: 'Death Date', type: 'date', icon: <Calendar className="h-4 w-4" /> },
            { key: 'nationality', label: 'Nationality', type: 'text', icon: <Globe className="h-4 w-4" /> },
            { key: 'gender', label: 'Gender', type: 'text', icon: <User className="h-4 w-4" /> }
          ],
          media: [
            { key: 'image_url', label: 'Profile Image', type: 'url', icon: <Upload className="h-4 w-4" /> },
            { key: 'website', label: 'Website', type: 'url', icon: <Globe className="h-4 w-4" /> },
            { key: 'social_links', label: 'Social Links', type: 'json', icon: <Globe className="h-4 w-4" /> }
          ],
          metadata: [
            { key: 'tags', label: 'Tags', type: 'array', icon: <Tag className="h-4 w-4" /> },
            { key: 'categories', label: 'Categories', type: 'array', icon: <Tag className="h-4 w-4" /> },
            { key: 'view_count', label: 'View Count', type: 'number', readonly: true, icon: <Eye className="h-4 w-4" /> }
          ]
        };

      case 'community_groups':
        return {
          basic: [
            { key: 'name', label: 'Group Name', type: 'text', required: true, icon: <Users className="h-4 w-4" /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'rules', label: 'Group Rules', type: 'textarea', icon: <Tag className="h-4 w-4" /> }
          ],
          settings: [
            { key: 'is_private', label: 'Private Group', type: 'boolean', icon: <Users className="h-4 w-4" /> },
            { key: 'member_count', label: 'Member Count', type: 'number', readonly: true, icon: <Users className="h-4 w-4" /> }
          ],
          media: [
            { key: 'image_url', label: 'Group Image', type: 'url', icon: <Upload className="h-4 w-4" /> },
            { key: 'tags', label: 'Tags', type: 'array', icon: <Tag className="h-4 w-4" /> }
          ]
        };

      case 'community_posts':
        return {
          basic: [
            { key: 'content', label: 'Post Content', type: 'textarea', required: true, icon: <Tag className="h-4 w-4" /> },
            { key: 'post_type', label: 'Post Type', type: 'select', options: ['text', 'image', 'link', 'poll'], icon: <Tag className="h-4 w-4" /> }
          ],
          settings: [
            { key: 'visibility', label: 'Visibility', type: 'select', options: ['public', 'private', 'friends'], icon: <Eye className="h-4 w-4" /> },
            { key: 'pinned', label: 'Pinned Post', type: 'boolean', icon: <Star className="h-4 w-4" /> }
          ],
          engagement: [
            { key: 'likes_count', label: 'Likes', type: 'number', readonly: true, icon: <Star className="h-4 w-4" /> },
            { key: 'comments_count', label: 'Comments', type: 'number', readonly: true, icon: <Users className="h-4 w-4" /> },
            { key: 'shares_count', label: 'Shares', type: 'number', readonly: true, icon: <Globe className="h-4 w-4" /> }
          ],
          media: [
            { key: 'images', label: 'Images', type: 'array', icon: <Upload className="h-4 w-4" /> },
            { key: 'link_url', label: 'Link URL', type: 'url', icon: <Globe className="h-4 w-4" /> },
            { key: 'tags', label: 'Tags', type: 'array', icon: <Tag className="h-4 w-4" /> }
          ]
        };

      case 'cms_content':
        return {
          basic: [
            { key: 'title', label: 'Title', type: 'text', required: true, icon: <Tag className="h-4 w-4" /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'content_type', label: 'Content Type', type: 'select', options: ['page', 'article', 'blog_post'], icon: <Tag className="h-4 w-4" /> },
            { key: 'workflow_state', label: 'Workflow State', type: 'select', options: ['draft', 'review', 'published', 'archived'], icon: <Star className="h-4 w-4" /> }
          ],
          settings: [
            { key: 'visibility_level', label: 'Visibility', type: 'select', options: ['public', 'private', 'restricted'], icon: <Eye className="h-4 w-4" /> },
            { key: 'featured_weight', label: 'Featured Weight', type: 'number', icon: <Star className="h-4 w-4" /> }
          ],
          meta: [
            { key: 'meta_title', label: 'Meta Title', type: 'text', icon: <Globe className="h-4 w-4" /> },
            { key: 'meta_description', label: 'Meta Description', type: 'textarea', icon: <Globe className="h-4 w-4" /> },
            { key: 'slug', label: 'URL Slug', type: 'text', icon: <Globe className="h-4 w-4" /> },
            { key: 'tags', label: 'Tags', type: 'array', icon: <Tag className="h-4 w-4" /> }
          ]
        };

      case 'news_articles':
        return {
          basic: [
            { key: 'title', label: 'Article Title', type: 'text', required: true, icon: <Tag className="h-4 w-4" /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'excerpt', label: 'Excerpt', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'content', label: 'Article Content', type: 'textarea', icon: <Tag className="h-4 w-4" /> }
          ],
          meta: [
            { key: 'author', label: 'Author', type: 'text', icon: <User className="h-4 w-4" /> },
            { key: 'category', label: 'Category', type: 'text', icon: <Tag className="h-4 w-4" /> },
            { key: 'status', label: 'Status', type: 'select', options: ['draft', 'published', 'archived'], icon: <Star className="h-4 w-4" /> },
            { key: 'published_at', label: 'Published Date', type: 'datetime', icon: <Calendar className="h-4 w-4" /> }
          ],
          media: [
            { key: 'image_url', label: 'Featured Image', type: 'url', icon: <Upload className="h-4 w-4" /> },
            { key: 'source_url', label: 'Source URL', type: 'url', icon: <Globe className="h-4 w-4" /> }
          ],
          settings: [
            { key: 'is_featured', label: 'Featured Article', type: 'boolean', icon: <Star className="h-4 w-4" /> },
            { key: 'views_count', label: 'Views', type: 'number', readonly: true, icon: <Eye className="h-4 w-4" /> },
            { key: 'tags', label: 'Tags', type: 'array', icon: <Tag className="h-4 w-4" /> }
          ]
        };

      case 'tags':
        return {
          basic: [
            { key: 'name', label: 'Tag Name', type: 'text', required: true, icon: <Tag className="h-4 w-4" /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'category', label: 'Category', type: 'text', icon: <Tag className="h-4 w-4" /> },
            { key: 'slug', label: 'URL Slug', type: 'text', icon: <Globe className="h-4 w-4" /> }
          ],
          appearance: [
            { key: 'color', label: 'Tag Color', type: 'text', icon: <Star className="h-4 w-4" /> },
            { key: 'image_url', label: 'Tag Image', type: 'url', icon: <Upload className="h-4 w-4" /> }
          ],
          metadata: [
            { key: 'usage_count', label: 'Usage Count', type: 'number', readonly: true, icon: <Users className="h-4 w-4" /> },
            { key: 'wikipedia_url', label: 'Wikipedia URL', type: 'url', icon: <Globe className="h-4 w-4" /> }
          ]
        };

      case 'cities':
        return {
          basic: [
            { key: 'name', label: 'City Name', type: 'text', required: true, icon: <Building className="h-4 w-4" /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'region_name', label: 'Region', type: 'text', icon: <MapPin className="h-4 w-4" /> }
          ],
          location: [
            { key: 'latitude', label: 'Latitude', type: 'number', icon: <MapPin className="h-4 w-4" /> },
            { key: 'longitude', label: 'Longitude', type: 'number', icon: <MapPin className="h-4 w-4" /> },
            { key: 'timezone', label: 'Timezone', type: 'text', icon: <Clock className="h-4 w-4" /> }
          ],
          details: [
            { key: 'population', label: 'Population', type: 'number', icon: <Users className="h-4 w-4" /> },
            { key: 'is_capital', label: 'Is Capital', type: 'boolean', icon: <Star className="h-4 w-4" /> },
            { key: 'is_major_city', label: 'Is Major City', type: 'boolean', icon: <Star className="h-4 w-4" /> },
            { key: 'image_url', label: 'City Image', type: 'url', icon: <Upload className="h-4 w-4" /> }
          ]
        };

      case 'countries':
        return {
          basic: [
            { key: 'name', label: 'Country Name', type: 'text', required: true, icon: <Globe className="h-4 w-4" /> },
            { key: 'code', label: 'Country Code', type: 'text', icon: <Globe className="h-4 w-4" /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'capital', label: 'Capital City', type: 'text', icon: <Building className="h-4 w-4" /> }
          ],
          details: [
            { key: 'population', label: 'Population', type: 'number', icon: <Users className="h-4 w-4" /> },
            { key: 'area_km2', label: 'Area (km²)', type: 'number', icon: <MapPin className="h-4 w-4" /> },
            { key: 'currency', label: 'Currency', type: 'text', icon: <Tag className="h-4 w-4" /> },
            { key: 'languages', label: 'Languages', type: 'array', icon: <Globe className="h-4 w-4" /> }
          ],
          location: [
            { key: 'latitude', label: 'Latitude', type: 'number', icon: <MapPin className="h-4 w-4" /> },
            { key: 'longitude', label: 'Longitude', type: 'number', icon: <MapPin className="h-4 w-4" /> },
            { key: 'timezone', label: 'Timezone', type: 'text', icon: <Clock className="h-4 w-4" /> }
          ]
        };

      case 'marketplace_listings':
        return {
          basic: [
            { key: 'title', label: 'Listing Title', type: 'text', required: true, icon: <Tag className="h-4 w-4" /> },
            { key: 'business_name', label: 'Business Name', type: 'text', icon: <Building className="h-4 w-4" /> },
            { key: 'description', label: 'Description', type: 'textarea', icon: <Tag className="h-4 w-4" /> },
            { key: 'category', label: 'Category', type: 'text', icon: <Tag className="h-4 w-4" /> }
          ],
          pricing: [
            { key: 'price', label: 'Price', type: 'number', icon: <Tag className="h-4 w-4" /> },
            { key: 'currency', label: 'Currency', type: 'text', icon: <Tag className="h-4 w-4" /> },
            { key: 'business_type', label: 'Business Type', type: 'text', icon: <Building className="h-4 w-4" /> }
          ],
          contact: [
            { key: 'contact_email', label: 'Contact Email', type: 'email', icon: <Users className="h-4 w-4" /> },
            { key: 'contact_phone', label: 'Contact Phone', type: 'tel', icon: <Users className="h-4 w-4" /> },
            { key: 'website', label: 'Website', type: 'url', icon: <Globe className="h-4 w-4" /> }
          ],
          details: [
            { key: 'location', label: 'Location', type: 'text', icon: <MapPin className="h-4 w-4" /> },
            { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'pending'], icon: <Star className="h-4 w-4" /> },
            { key: 'images', label: 'Images', type: 'array', icon: <Upload className="h-4 w-4" /> }
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
            icon: <Tag className="h-4 w-4" /> 
          }));
        }
        
        if (locationFields.length > 0) {
          fieldGroups.location = locationFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <MapPin className="h-4 w-4" /> 
          }));
        }
        
        if (contactFields.length > 0) {
          fieldGroups.contact = contactFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Users className="h-4 w-4" /> 
          }));
        }
        
        if (mediaFields.length > 0) {
          fieldGroups.media = mediaFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Upload className="h-4 w-4" /> 
          }));
        }
        
        if (dateFields.length > 0) {
          fieldGroups.dates = dateFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Calendar className="h-4 w-4" /> 
          }));
        }
        
        if (metaFields.length > 0) {
          fieldGroups.metadata = metaFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Tag className="h-4 w-4" /> 
          }));
        }
        
        if (statsFields.length > 0) {
          fieldGroups.statistics = statsFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Star className="h-4 w-4" />,
            readonly: true // Stats are usually read-only
          }));
        }
        
        if (otherFields.length > 0) {
          fieldGroups.other = otherFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Tag className="h-4 w-4" /> 
          }));
        }
        
        // If no fields were categorized, put everything in basic
        if (Object.keys(fieldGroups).length === 0) {
          fieldGroups.basic = allFields.map(key => ({ 
            key, 
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            type: 'auto', 
            icon: <Tag className="h-4 w-4" /> 
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
        <div key={key} className="space-y-2">
          <Label className="flex items-center gap-2">
            {icon}
            {label}
            <Badge variant="secondary" className="text-xs">Read-only</Badge>
          </Label>
          <div className="px-3 py-2 bg-muted rounded-md text-sm">
            {fieldValue?.toLocaleString() || 'N/A'}
          </div>
        </div>
      );
    }

    // Handle different field types based on configuration
    switch (type) {
      case 'text':
        // Special handling for profession field
        if (key === 'profession') {
          return (
            <div key={key} className="space-y-2">
              <Label htmlFor={key} className="flex items-center gap-2">
                {icon}
                {label}
                {required && <span className="text-destructive">*</span>}
              </Label>
              <ProfessionAutocomplete
                id={key}
                value={fieldValue || ''}
                onValueChange={(value) => handleFieldChange(key, value)}
                placeholder="Select or type a profession..."
                required={required}
              />
            </div>
          );
        }
        
        // Special handling for nationality field
        if (key === 'nationality') {
          return (
            <div key={key} className="space-y-2">
              <Label htmlFor={key} className="flex items-center gap-2">
                {icon}
                {label}
                {required && <span className="text-destructive">*</span>}
              </Label>
              <CountryAutocomplete
                id={key}
                value={fieldValue || ''}
                onValueChange={(value) => handleFieldChange(key, value)}
                placeholder="Select a country..."
                required={required}
              />
            </div>
          );
        }
        
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={key}
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              required={required}
            />
          </div>
        );

      case 'textarea':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id={key}
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              className="min-h-24"
              required={required}
            />
          </div>
        );

      case 'number':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={key}
              type="number"
              value={fieldValue !== null && fieldValue !== undefined ? fieldValue : ''}
              onChange={(e) => handleFieldChange(key, e.target.value ? Number(e.target.value) : null)}
              required={required}
            />
          </div>
        );

      case 'email':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={key}
              type="email"
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              required={required}
            />
          </div>
        );

      case 'tel':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={key}
              type="tel"
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              required={required}
            />
          </div>
        );

      case 'url':
        // Special handling for image URLs
        if (key === 'image_url' || key.includes('image')) {
          return (
            <div key={key} className="space-y-2">
              <ImageUpload
                id={key}
                value={fieldValue || ''}
                onValueChange={(value) => handleFieldChange(key, value)}
                label={label}
                required={required}
                maxSize={5}
              />
            </div>
          );
        }
        
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={key}
              type="url"
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              required={required}
            />
          </div>
        );

      case 'date':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={key}
              type="date"
              value={fieldValue ? (fieldValue instanceof Date ? fieldValue.toISOString().split('T')[0] : new Date(fieldValue).toISOString().split('T')[0]) : ''}
              onChange={(e) => handleFieldChange(key, e.target.value ? new Date(e.target.value).toISOString() : null)}
              required={required}
            />
          </div>
        );

      case 'datetime':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={key}
              type="datetime-local"
              value={fieldValue ? (fieldValue instanceof Date ? fieldValue.toISOString().slice(0, 16) : new Date(fieldValue).toISOString().slice(0, 16)) : ''}
              onChange={(e) => handleFieldChange(key, e.target.value ? new Date(e.target.value).toISOString() : null)}
              required={required}
            />
          </div>
        );

      case 'boolean':
        return (
          <div key={key} className="flex items-center space-x-2">
            <Switch
              id={key}
              checked={fieldValue || false}
              onCheckedChange={(checked) => handleFieldChange(key, checked)}
            />
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
            </Label>
          </div>
        );

      case 'select':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Select value={fieldValue || ''} onValueChange={(value) => handleFieldChange(key, value)}>
              <SelectTrigger>
                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent className="bg-background border border-border shadow-lg z-50">
                {options?.filter((option: string) => option && option.trim() !== '').map((option: string) => (
                  <SelectItem key={option} value={option} className="capitalize">
                    {option.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id={key}
              value={displayValue}
              onChange={(e) => {
                const items = e.target.value.split(',').map(item => item.trim()).filter(Boolean);
                handleFieldChange(key, items);
              }}
              placeholder="Enter comma-separated values"
              className="min-h-24"
            />
            {displayValue && (
              <div className="text-xs text-muted-foreground">
                Current: {displayValue.split(',').length} item(s)
              </div>
            )}
          </div>
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
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
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
              className="min-h-24 font-mono text-sm"
              placeholder="Enter JSON data"
            />
            {jsonDisplayValue && (
              <div className="text-xs text-muted-foreground">
                {jsonDisplayValue.length > 100 ? `${jsonDisplayValue.length} characters` : 'Valid JSON'}
              </div>
            )}
          </div>
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
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">No content selected for editing</p>
          <Button onClick={onClose} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            {content.image_url && (
              <Avatar className="h-12 w-12">
                <AvatarImage src={content.image_url} alt={content.title} />
                <AvatarFallback>
                  {content.content_type === 'events' && <Calendar className="h-6 w-6" />}
                  {content.content_type === 'venues' && <Building className="h-6 w-6" />}
                  {content.content_type === 'personalities' && <User className="h-6 w-6" />}
                  {content.content_type === 'community_groups' && <Users className="h-6 w-6" />}
                  {content.content_type === 'community_posts' && <Tag className="h-6 w-6" />}
                </AvatarFallback>
              </Avatar>
            )}
            <div>
              <h1 className="text-2xl font-bold">{content.title || content.name || 'Edit Content'}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="capitalize">
                  {content.content_type.replace('_', ' ')}
                </Badge>
                <span className="text-sm text-muted-foreground">ID: {content.id}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" disabled>
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Content Form with Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Content Details</CardTitle>
              <CardDescription>
                Edit the content fields below. Fields marked with * are required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                  {tabs.map(tab => (
                    <TabsTrigger key={tab} value={tab} className="capitalize">
                      {tab === 'basic' && <Tag className="h-4 w-4 mr-2" />}
                      {tab === 'datetime' && <Clock className="h-4 w-4 mr-2" />}
                      {tab === 'location' && <MapPin className="h-4 w-4 mr-2" />}
                      {tab === 'contact' && <Users className="h-4 w-4 mr-2" />}
                      {tab === 'details' && <Star className="h-4 w-4 mr-2" />}
                      {tab === 'personal' && <User className="h-4 w-4 mr-2" />}
                      {tab === 'media' && <Upload className="h-4 w-4 mr-2" />}
                      {tab === 'metadata' && <Tag className="h-4 w-4 mr-2" />}
                      {tab === 'settings' && <Star className="h-4 w-4 mr-2" />}
                      {tab === 'engagement' && <Users className="h-4 w-4 mr-2" />}
                      {tab.replace('_', ' ')}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {tabs.map(tab => (
                  <TabsContent key={tab} value={tab} className="space-y-4 mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {fieldGroups[tab]?.map(field => renderField(field))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Content Info */}
          <Card>
            <CardHeader>
              <CardTitle>Content Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Content Type</Label>
                <p className="text-sm text-muted-foreground capitalize">
                  {content.content_type.replace('_', ' ')}
                </p>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Created</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(content.created_at).toLocaleString()}
                </p>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Last Updated</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(content.updated_at).toLocaleString()}
                </p>
              </div>

              {content.status && (
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <Badge className="ml-2" variant={content.status === 'active' ? 'default' : 'secondary'}>
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
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full" disabled>
                <Eye className="h-4 w-4 mr-2" />
                View Public Page
              </Button>
              <Button variant="outline" size="sm" className="w-full" disabled>
                <Upload className="h-4 w-4 mr-2" />
                Upload Media
              </Button>
              <Button variant="outline" size="sm" className="w-full text-destructive" disabled>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Content
              </Button>
            </CardContent>
          </Card>

          {/* Raw Data Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Raw Data</CardTitle>
              <CardDescription>
                Original data structure for debugging
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48">
                <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                  {JSON.stringify(content, null, 2)}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
