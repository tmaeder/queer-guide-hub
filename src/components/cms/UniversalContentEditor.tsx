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

      default:
        return {
          basic: Object.keys(formData)
            .filter(key => !['id', 'created_at', 'updated_at', 'content_type'].includes(key))
            .map(key => ({ key, label: key.replace(/_/g, ' '), type: 'auto', icon: <Tag className="h-4 w-4" /> }))
        };
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
              value={fieldValue || ''}
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
              value={fieldValue ? new Date(fieldValue).toISOString().split('T')[0] : ''}
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
              value={fieldValue ? new Date(fieldValue).toISOString().slice(0, 16) : ''}
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
              <SelectContent>
                {options?.map((option: string) => (
                  <SelectItem key={option} value={option} className="capitalize">
                    {option.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'array':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id={key}
              value={Array.isArray(fieldValue) ? fieldValue.join(', ') : ''}
              onChange={(e) => handleFieldChange(key, e.target.value.split(',').map(item => item.trim()).filter(Boolean))}
              placeholder="Enter comma-separated values"
            />
          </div>
        );

      case 'json':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key} className="flex items-center gap-2">
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id={key}
              value={typeof fieldValue === 'object' ? JSON.stringify(fieldValue, null, 2) : fieldValue || ''}
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
