import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X } from "lucide-react";
import { usePersonalities, Personality } from "@/hooks/usePersonalities";
import { toast } from "@/hooks/use-toast";

interface AddPersonalityDialogProps {
  onSuccess?: () => void;
}

const FIELD_OPTIONS = [
  'activism', 'arts', 'politics', 'sports', 'entertainment', 'literature',
  'science', 'business', 'education', 'healthcare', 'technology', 'journalism',
  'military', 'religion', 'law', 'media', 'fashion', 'music', 'film', 'theater'
];

export function AddPersonalityDialog({ onSuccess }: AddPersonalityDialogProps) {
  const { createPersonality } = usePersonalities();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<{
    name: string;
    pronouns: string;
    description: string;
    bio: string;
    birth_date: string;
    death_date: string;
    is_living: boolean;
    profession: string;
    fields: string[];
    achievements: string[];
    image_url: string;
    website_url: string;
    nationality: string;
    birth_place: string;
    tags: string[];
    verification_status: 'pending' | 'verified' | 'disputed';
    visibility: 'public' | 'private' | 'draft';
    is_featured: boolean;
  }>({
    name: '',
    pronouns: '',
    description: '',
    bio: '',
    birth_date: '',
    death_date: '',
    is_living: true,
    profession: '',
    fields: [],
    achievements: [],
    image_url: '',
    website_url: '',
    nationality: '',
    birth_place: '',
    tags: [],
    verification_status: 'pending',
    visibility: 'public',
    is_featured: false
  });

  const [newAchievement, setNewAchievement] = useState('');
  const [newTag, setNewTag] = useState('');

  const handleFieldToggle = (field: string) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.includes(field)
        ? prev.fields.filter(f => f !== field)
        : [...prev.fields, field]
    }));
  };

  const addAchievement = () => {
    if (newAchievement.trim()) {
      setFormData(prev => ({
        ...prev,
        achievements: [...prev.achievements, newAchievement.trim()]
      }));
      setNewAchievement('');
    }
  };

  const removeAchievement = (index: number) => {
    setFormData(prev => ({
      ...prev,
      achievements: prev.achievements.filter((_, i) => i !== index)
    }));
  };

  const addTag = () => {
    if (newTag.trim()) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      await createPersonality({
        ...formData,
        social_links: {}
      });
      
      // Reset form
      setFormData({
        name: '',
        pronouns: '',
        description: '',
        bio: '',
        birth_date: '',
        death_date: '',
        is_living: true,
        profession: '',
        fields: [],
        achievements: [],
        image_url: '',
        website_url: '',
        nationality: '',
        birth_place: '',
        tags: [],
        verification_status: 'pending',
        visibility: 'public',
        is_featured: false
      });
      
      setOpen(false);
      onSuccess?.();
      
    } catch (error) {
      console.error('Error creating personality:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Plus className="h-5 w-5" />
          Add Personality
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Personality</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <h3 className="font-semibold text-lg mb-3">Basic Information</h3>
                
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Full name"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="pronouns">Pronouns</Label>
                  <Input
                    id="pronouns"
                    value={formData.pronouns}
                    onChange={(e) => setFormData(prev => ({ ...prev, pronouns: e.target.value }))}
                    placeholder="e.g., they/them, she/her, he/him"
                  />
                </div>

                <div>
                  <Label htmlFor="profession">Profession</Label>
                  <Input
                    id="profession"
                    value={formData.profession}
                    onChange={(e) => setFormData(prev => ({ ...prev, profession: e.target.value }))}
                    placeholder="Primary profession or role"
                  />
                </div>

                <div>
                  <Label htmlFor="nationality">Nationality</Label>
                  <Input
                    id="nationality"
                    value={formData.nationality}
                    onChange={(e) => setFormData(prev => ({ ...prev, nationality: e.target.value }))}
                    placeholder="Country of origin"
                  />
                </div>

                <div>
                  <Label htmlFor="birth_place">Birth Place</Label>
                  <Input
                    id="birth_place"
                    value={formData.birth_place}
                    onChange={(e) => setFormData(prev => ({ ...prev, birth_place: e.target.value }))}
                    placeholder="City, Country"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Dates and Status */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <h3 className="font-semibold text-lg mb-3">Dates & Status</h3>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_living"
                    checked={formData.is_living}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, is_living: !!checked }))
                    }
                  />
                  <Label htmlFor="is_living">Currently living</Label>
                </div>

                <div>
                  <Label htmlFor="birth_date">Birth Date</Label>
                  <Input
                    id="birth_date"
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, birth_date: e.target.value }))}
                  />
                </div>

                {!formData.is_living && (
                  <div>
                    <Label htmlFor="death_date">Death Date</Label>
                    <Input
                      id="death_date"
                      type="date"
                      value={formData.death_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, death_date: e.target.value }))}
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="visibility">Visibility</Label>
                  <Select
                    value={formData.visibility}
                    onValueChange={(value: 'public' | 'private' | 'draft') =>
                      setFormData(prev => ({ ...prev, visibility: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="image_url">Image URL</Label>
                  <Input
                    id="image_url"
                    value={formData.image_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>

                <div>
                  <Label htmlFor="website_url">Website URL</Label>
                  <Input
                    id="website_url"
                    value={formData.website_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, website_url: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Description and Bio */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-lg mb-3">Description & Biography</h3>
              
              <div>
                <Label htmlFor="description">Short Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description (1-2 sentences)"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="bio">Biography</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                  placeholder="Detailed biography"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Fields of Work */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-lg mb-3">Fields of Work</h3>
              
              {formData.fields.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {formData.fields.map((field) => (
                    <Badge key={field} variant="secondary" className="flex items-center gap-1">
                      {field}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-transparent"
                        onClick={() => handleFieldToggle(field)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
              
              <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto">
                {FIELD_OPTIONS.map((field) => (
                  <div key={field} className="flex items-center space-x-2">
                    <Checkbox
                      id={field}
                      checked={formData.fields.includes(field)}
                      onCheckedChange={() => handleFieldToggle(field)}
                    />
                    <Label htmlFor={field} className="text-sm capitalize cursor-pointer">
                      {field}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Achievements */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-lg mb-3">Achievements</h3>
              
              <div className="flex gap-2">
                <Input
                  value={newAchievement}
                  onChange={(e) => setNewAchievement(e.target.value)}
                  placeholder="Add an achievement"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAchievement())}
                />
                <Button type="button" onClick={addAchievement} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {formData.achievements.length > 0 && (
                <div className="space-y-2">
                  {formData.achievements.map((achievement, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                      <span className="flex-1 text-sm">{achievement}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAchievement(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-lg mb-3">Tags</h3>
              
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {formData.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" className="flex items-center gap-1">
                      {tag}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-transparent"
                        onClick={() => removeTag(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Personality'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}