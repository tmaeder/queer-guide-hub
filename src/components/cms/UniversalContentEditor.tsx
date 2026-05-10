import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Eye, Trash2, Upload, MapPin, Clock, Users, Tag, Globe, Calendar, User, Building, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { updateRow } from '@/hooks/usePageFetchers';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { AutoTagPanel } from '@/components/cms/AutoTagPanel';
import { GeoLinkPanel } from '@/components/cms/GeoLinkPanel';
import { TranslationPanel } from '@/components/cms/TranslationPanel';
import { getFieldGroups } from './editor/fieldGroups';
import { EditorField } from './editor/EditorField';

interface UniversalContentEditorProps {
  content: Record<string, unknown>;
  onClose: () => void;
}

export function UniversalContentEditor({ content, onClose }: UniversalContentEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [originalData, setOriginalData] = useState<Record<string, unknown>>({});
  const [activeTab, setActiveTab] = useState('basic');

  useEffect(() => {
    if (content) {
      const editableData = { ...content };
      setFormData(editableData);
      setOriginalData(editableData);
    }
  }, [content]);

  const handleFieldChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user) {
      toast({ title: "Authentication required", description: "You must be logged in to save changes", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const tableName = content.content_type;
      const changes: Record<string, unknown> = {};

      Object.keys(formData).forEach(key => {
        if (formData[key] !== originalData[key] && key !== 'content_type' && key !== 'id') {
          changes[key] = formData[key];
        }
      });

      if (Object.keys(changes).length === 0) {
        toast({ title: "No changes", description: "No changes were made to save" });
        setLoading(false);
        return;
      }

      changes['updated_at'] = new Date().toISOString();
      const { error } = await updateRow(tableName as string, content.id, changes);
      if (error) throw error;

      toast({ title: "Content updated", description: "Your changes have been saved successfully" });
      onClose();
    } catch (error) {
      console.error('Error saving content:', error);
      toast({ title: "Error", description: error instanceof Error ? error.message : 'Failed to save changes', variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fieldGroups = getFieldGroups(content.content_type, formData);
  const tabs = Object.keys(fieldGroups);

  if (!content) {
    return (
      <Card>
        <CardContent>
          <p style={{ color: 'var(--muted-foreground)' }}>No content selected for editing</p>
          <Button onClick={onClose}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  const tabIcons: Record<string, typeof Tag> = {
    basic: Tag, datetime: Clock, location: MapPin, contact: Users,
    details: Star, personal: User, media: Upload, metadata: Tag,
    settings: Star, engagement: Users,
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onClose}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            Back
          </Button>
          <div className="flex items-center gap-3">
            {content.image_url && (
              <Avatar style={{ height: 48, width: 48 }}>
                <AvatarImage src={content.image_url as string} alt={content.title as string} />
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
              <h1 className="text-2xl font-bold">{(content.title || content.name || 'Edit Content') as string}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">
                  {(content.content_type as string).replace('_', ' ')}
                </Badge>
                <span className="text-sm text-muted-foreground">ID: {content.id as string}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" disabled>
            <Eye style={{ height: 16, width: 16, marginRight: 8 }} />
            Preview
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            <Save style={{ height: 16, width: 16, marginRight: 8 }} />
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
                <TabsList>
                  {tabs.map(tab => {
                    const TabIcon = tabIcons[tab] || Tag;
                    return (
                      <TabsTrigger key={tab} value={tab}>
                        <TabIcon style={{ height: 16, width: 16, marginRight: 8 }} />
                        {tab.replace('_', ' ')}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {tabs.map(tab => (
                  <TabsContent key={tab} value={tab}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {fieldGroups[tab]?.map(field => (
                        <EditorField
                          key={field.key}
                          field={field}
                          value={formData[field.key]}
                          onChange={handleFieldChange}
                        />
                      ))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Content Information</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <Label>Content Type</Label>
                <p className="text-sm text-muted-foreground capitalize">
                  {(content.content_type as string).replace('_', ' ')}
                </p>
              </div>
              <div>
                <Label>Created</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(content.created_at as string).toLocaleString()}
                </p>
              </div>
              <div>
                <Label>Last Updated</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(content.updated_at as string).toLocaleString()}
                </p>
              </div>
              {content.status && (
                <div>
                  <Label>Status</Label>
                  <Badge className="ml-2" variant={content.status === 'active' ? 'default' : 'secondary'}>
                    {content.status as string}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" disabled>
                <Eye style={{ height: 16, width: 16, marginRight: 8 }} />
                View Public Page
              </Button>
              <Button variant="outline" size="sm" disabled>
                <Upload style={{ height: 16, width: 16, marginRight: 8 }} />
                Upload Media
              </Button>
              <Button variant="outline" size="sm" disabled>
                <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                Delete Content
              </Button>
            </CardContent>
          </Card>

          {content?.id && content?.content_type && (
            <AutoTagPanel
              contentType={content.content_type as string}
              contentId={content.id as string}
            />
          )}

          {content?.id && content?.content_type && (
            <GeoLinkPanel
              contentType={content.content_type as string}
              contentId={content.id as string}
              cityName={(content.city || content.birth_place) as string}
              countryName={(content.country || content.nationality) as string}
              hasCityId={!!content.city_id}
              hasCountryId={!!content.country_id}
            />
          )}

          {content?.id && content?.content_type && (
            <TranslationPanel
              tableName={String(content.content_type)}
              recordId={String(content.id)}
              originalData={content as Record<string, unknown>}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Raw Data</CardTitle>
              <CardDescription>Original data structure for debugging</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea>
                <pre className="text-xs bg-accent p-2 rounded-md overflow-auto">
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
