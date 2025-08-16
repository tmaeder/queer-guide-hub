import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Eye, Trash2 } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface UniversalContentEditorProps {
  content: any;
  onClose: () => void;
}

export function UniversalContentEditor({ content, onClose }: UniversalContentEditorProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [originalData, setOriginalData] = useState<any>({});

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

  const renderField = (key: string, value: any) => {
    // Skip system fields
    if (['id', 'created_at', 'updated_at', 'content_type'].includes(key)) {
      return null;
    }

    const fieldValue = formData[key];

    // Handle different field types
    if (key.includes('_at') && typeof fieldValue === 'string') {
      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={key} className="capitalize">{key.replace(/_/g, ' ')}</Label>
          <Input
            id={key}
            type="datetime-local"
            value={fieldValue ? new Date(fieldValue).toISOString().slice(0, 16) : ''}
            onChange={(e) => handleFieldChange(key, e.target.value ? new Date(e.target.value).toISOString() : null)}
          />
        </div>
      );
    }

    if (typeof fieldValue === 'boolean') {
      return (
        <div key={key} className="flex items-center space-x-2">
          <Switch
            id={key}
            checked={fieldValue || false}
            onCheckedChange={(checked) => handleFieldChange(key, checked)}
          />
          <Label htmlFor={key} className="capitalize">{key.replace(/_/g, ' ')}</Label>
        </div>
      );
    }

    if (typeof fieldValue === 'number') {
      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={key} className="capitalize">{key.replace(/_/g, ' ')}</Label>
          <Input
            id={key}
            type="number"
            value={fieldValue || ''}
            onChange={(e) => handleFieldChange(key, e.target.value ? Number(e.target.value) : null)}
          />
        </div>
      );
    }

    if (typeof fieldValue === 'string' && fieldValue && fieldValue.length > 100) {
      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={key} className="capitalize">{key.replace(/_/g, ' ')}</Label>
          <Textarea
            id={key}
            value={fieldValue || ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className="min-h-32"
          />
        </div>
      );
    }

    if (Array.isArray(fieldValue)) {
      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={key} className="capitalize">{key.replace(/_/g, ' ')}</Label>
          <Textarea
            id={key}
            value={fieldValue ? fieldValue.join(', ') : ''}
            onChange={(e) => handleFieldChange(key, e.target.value.split(',').map(item => item.trim()).filter(Boolean))}
            placeholder="Enter comma-separated values"
          />
        </div>
      );
    }

    if (typeof fieldValue === 'object' && fieldValue !== null) {
      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={key} className="capitalize">{key.replace(/_/g, ' ')}</Label>
          <Textarea
            id={key}
            value={JSON.stringify(fieldValue, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                handleFieldChange(key, parsed);
              } catch {
                // Invalid JSON, keep as string for now
              }
            }}
            className="min-h-24 font-mono text-sm"
          />
        </div>
      );
    }

    // Default to text input
    return (
      <div key={key} className="space-y-2">
        <Label htmlFor={key} className="capitalize">{key.replace(/_/g, ' ')}</Label>
        <Input
          id={key}
          value={fieldValue || ''}
          onChange={(e) => handleFieldChange(key, e.target.value)}
        />
      </div>
    );
  };

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
          <div>
            <h1 className="text-2xl font-bold">Edit Content</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="capitalize">
                {content.content_type.replace('_', ' ')}
              </Badge>
              <span className="text-sm text-muted-foreground">ID: {content.id}</span>
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

      {/* Content Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Content Details</CardTitle>
              <CardDescription>
                Edit the content fields below. Changes are only saved when you click "Save Changes".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-4 pr-4">
                  {Object.entries(formData).map(([key, value]) => renderField(key, value))}
                </div>
              </ScrollArea>
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
