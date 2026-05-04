import { useState, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X, Upload, ImageIcon, Search, Loader2, Check } from "lucide-react";
import { usePersonalities } from "@/hooks/usePersonalities";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { CountryAutocomplete } from "@/components/ui/country-autocomplete";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PersonalitySelectionDialog } from "./PersonalitySelectionDialog";

interface AddPersonalityDialogProps {
  onSuccess?: () => void;
}

const FIELD_OPTIONS = [
  'activism', 'arts', 'politics', 'sports', 'entertainment', 'literature',
  'science', 'business', 'education', 'healthcare', 'technology', 'journalism',
  'military', 'religion', 'law', 'media', 'fashion', 'music', 'film', 'theater'
];

export function AddPersonalityDialog({ onSuccess }: AddPersonalityDialogProps) {
  const { createPersonality } = usePersonalities(false);
  const { resolveNationality, resolveBirthPlace, resolving: resolvingGeo } = useAddressResolver();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvedCountryId, setResolvedCountryId] = useState<string | null>(null);
  const [resolvedCityId, setResolvedCityId] = useState<string | null>(null);
  const [resolvedCountryName, setResolvedCountryName] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
    name: string;
    pronouns: string;
    description: string;
    bio: string;
    birth_date: string;
    death_date: string;
    death_place: string;
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
    death_place: '',
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
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectionDialogOpen, setSelectionDialogOpen] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string; description?: string }>>([]);

  // Per-field validation errors. Keyed by field name; empty/undefined ⇒ no error.
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});
  const nameInputRef = useRef<HTMLInputElement>(null);

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

  const handleNationalityChange = useCallback(async (value: string) => {
    setFormData(prev => ({ ...prev, nationality: value }));
    setResolvedCountryId(null);
    setResolvedCountryName(null);

    if (value.trim()) {
      const resolved = await resolveNationality(value);
      if (resolved?.country_id) {
        setResolvedCountryId(resolved.country_id);
        setResolvedCountryName(resolved.country_name);
      }
    }
  }, [resolveNationality]);

  const handleBirthPlaceChange = useCallback(async (value: string) => {
    setFormData(prev => ({ ...prev, birth_place: value }));
    setResolvedCityId(null);

    if (value.trim() && value.includes(',')) {
      const resolved = await resolveBirthPlace(value);
      if (resolved?.city_id) {
        setResolvedCityId(resolved.city_id);
        // If nationality wasn't resolved yet but birth place has a country, use it
        if (!resolvedCountryId && resolved.country_id) {
          setResolvedCountryId(resolved.country_id);
          setResolvedCountryName(resolved.country_name);
        }
      }
    }
  }, [resolveBirthPlace, resolvedCountryId]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please select an image file",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image must be less than 5MB",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('personalities')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('personalities')
        .getPublicUrl(fileName);

      setFormData(prev => ({ ...prev, image_url: publicUrl }));

      toast({
        title: "Success",
        description: "Image uploaded successfully"
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setFormData(prev => ({ ...prev, image_url: '' }));
  };

  const handleWikipediaLookup = async () => {
    if (!searchTerm.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name to search",
        variant: "destructive"
      });
      return;
    }

    setLookupLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-personality-data', {
        body: { searchTerm: searchTerm.trim() }
      });

      if (error) throw error;

      if (data.success) {
        if (data.multiple_results && data.candidates) {
          // Show selection dialog for multiple results
          setCandidates(data.candidates);
          setSelectionDialogOpen(true);
        } else if (data.data) {
          // Single result, prefill form
          prefillFormData(data.data);
        }
      } else {
        toast({
          title: "No data found",
          description: "No Wikipedia/Wikidata entry found for this person",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error looking up personality:', error);
      toast({
        title: "Error",
        description: "Failed to lookup personality data",
        variant: "destructive"
      });
    } finally {
      setLookupLoading(false);
    }
  };

  const handleCandidateSelection = async (candidate: { id: string; name: string; description?: string }) => {
    setLookupLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-personality-data', {
        body: {
          searchTerm: searchTerm.trim(),
          selectedId: candidate.id
        }
      });

      if (error) throw error;

      if (data.success && data.data) {
        prefillFormData(data.data);
        setSelectionDialogOpen(false);
      }
    } catch (error) {
      console.error('Error fetching selected personality:', error);
      toast({
        title: "Error",
        description: "Failed to fetch personality data",
        variant: "destructive"
      });
    } finally {
      setLookupLoading(false);
    }
  };

  const prefillFormData = (personalityData: Record<string, unknown>) => {
    setFormData(prev => ({
      ...prev,
      name: personalityData.name || prev.name,
      description: personalityData.description || prev.description,
      bio: personalityData.bio || prev.bio,
      birth_date: personalityData.birth_date || prev.birth_date,
      death_date: personalityData.death_date || prev.death_date,
      death_place: personalityData.death_place || prev.death_place,
      is_living: personalityData.is_living !== undefined ? personalityData.is_living : prev.is_living,
      profession: personalityData.profession || prev.profession,
      nationality: personalityData.nationality || prev.nationality,
      birth_place: personalityData.birth_place || prev.birth_place,
      image_url: personalityData.image_url || prev.image_url,
      website_url: personalityData.website_url || prev.website_url,
      fields: personalityData.fields && personalityData.fields.length > 0 ? personalityData.fields : prev.fields
    }));

    toast({
      title: "Success",
      description: `Data found and prefilled for ${personalityData.name}`,
    });

    // Auto-resolve nationality and birth_place from prefilled data
    if (personalityData.nationality) {
      handleNationalityChange(personalityData.nationality);
    }
    if (personalityData.birth_place) {
      handleBirthPlaceChange(personalityData.birth_place);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: { name?: string } = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (formData.name.length > 120) errors.name = 'Name is too long (max 120 characters)';

    if (errors.name) {
      setFieldErrors(errors);
      // Focus the first invalid field so screen readers announce the error.
      nameInputRef.current?.focus();
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      const personalityData: Record<string, unknown> = {
        ...formData,
        social_links: {},
      };
      // Attach resolved FK IDs
      if (resolvedCountryId) personalityData.country_id = resolvedCountryId;
      if (resolvedCityId) personalityData.city_id = resolvedCityId;

      await createPersonality(personalityData);

      // Reset form
      setFormData({
        name: '',
        pronouns: '',
        description: '',
        bio: '',
        birth_date: '',
        death_date: '',
        death_place: '',
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

      setResolvedCountryId(null);
      setResolvedCityId(null);
      setResolvedCountryName(null);
      setOpen(false);
      onSuccess?.();

    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast({
        title: "Error",
        description: "Failed to add personality. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus />
          Add Personality
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Personality</DialogTitle>
        </DialogHeader>

        {/* Wikipedia/Wikidata Lookup */}
        <Card>
          <CardContent>
            <h6 className="text-lg font-semibold mb-3">Quick Lookup</h6>
            <p className="text-sm text-muted-foreground mb-3">
              Search Wikipedia/Wikidata to automatically prefill personality information
            </p>

            <div className="flex gap-2">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Enter person's name to lookup..."
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleWikipediaLookup())}
              />
              <Button
                type="button"
                onClick={handleWikipediaLookup}
                disabled={lookupLoading || !searchTerm.trim()}
              >
                {lookupLoading ? (
                  <Loader2 />
                ) : (
                  <Search />
                )}
                {lookupLoading ? 'Searching...' : 'Lookup'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <Card>
              <CardContent>
                <h6 className="text-lg font-semibold mb-3">Basic Information</h6>

                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    ref={nameInputRef}
                    value={formData.name}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, name: e.target.value }));
                      // Clear the error as soon as the user starts typing.
                      if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: undefined }));
                    }}
                    placeholder="Full name"
                    required
                    aria-invalid={!!fieldErrors.name}
                    aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                  />
                  {fieldErrors.name && (
                    <p id="name-error" role="alert" className="text-destructive text-sm mt-1">
                      {fieldErrors.name}
                    </p>
                  )}
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
                  <CountryAutocomplete
                    id="nationality"
                    value={formData.nationality}
                    onValueChange={handleNationalityChange}
                    placeholder="Select country / nationality..."
                  />
                  {resolvedCountryName && (
                    <div className="flex items-center gap-1 mt-1">
                      <Check style={{ width: 12, height: 12, color: '#22c55e' }} />
                      <span className="text-xs" style={{ color: '#22c55e' }}>
                        Linked to {resolvedCountryName}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="birth_place">Birth Place</Label>
                  <div className="relative">
                    <Input
                      id="birth_place"
                      value={formData.birth_place}
                      onChange={(e) => setFormData(prev => ({ ...prev, birth_place: e.target.value }))}
                      onBlur={() => handleBirthPlaceChange(formData.birth_place)}
                      placeholder="City, Country (e.g. New York, United States)"
                    />
                    {resolvingGeo && (
                      <Loader2 style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, animation: 'spin 1s linear infinite', color: '#999' }} />
                    )}
                  </div>
                  {resolvedCityId && (
                    <div className="flex items-center gap-1 mt-1">
                      <Check style={{ width: 12, height: 12, color: '#22c55e' }} />
                      <span className="text-xs" style={{ color: '#22c55e' }}>
                        City linked in database
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Dates and Status */}
            <Card>
              <CardContent>
                <h6 className="text-lg font-semibold mb-3">Dates & Status</h6>

                <div className="flex items-center gap-2">
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
                  <>
                    <div>
                      <Label htmlFor="death_date">Death Date</Label>
                      <Input
                        id="death_date"
                        type="date"
                        value={formData.death_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, death_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="death_place">Death Place</Label>
                      <Input
                        id="death_place"
                        value={formData.death_place}
                        onChange={(e) => setFormData(prev => ({ ...prev, death_place: e.target.value }))}
                        placeholder="City, Country"
                      />
                    </div>
                  </>
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

                {/* Image Upload */}
                <div>
                  <Label>Profile Image</Label>
                  <div className="flex flex-col gap-3">
                    {formData.image_url ? (
                      <div className="relative">
                        <img
                          src={formData.image_url}
                          alt="Preview"
                          className="w-32 h-32 object-cover rounded-md border border-border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={removeImage}
                        >
                          <X />
                        </Button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-muted-foreground rounded-md p-6 text-center">
                        <ImageIcon />
                        <p className="text-sm text-muted-foreground">No image uploaded</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('image-upload')?.click()}
                        disabled={uploading}
                      >
                        <Upload />
                        {uploading ? 'Uploading...' : 'Upload Image'}
                      </Button>
                      <input
                        id="image-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                    </div>

                    <span className="text-xs text-muted-foreground">
                      Or enter URL manually:
                    </span>
                    <Input
                      value={formData.image_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
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
            <CardContent>
              <h6 className="text-lg font-semibold mb-3">Description & Biography</h6>

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
            <CardContent>
              <h6 className="text-lg font-semibold mb-3">Fields of Work</h6>

              {formData.fields.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {formData.fields.map((field) => (
                    <Badge key={field} variant="secondary">
                      {field}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFieldToggle(field)}
                      >
                        <X />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto">
                {FIELD_OPTIONS.map((field) => (
                  <div key={field} className="flex items-center gap-2">
                    <Checkbox
                      id={field}
                      checked={formData.fields.includes(field)}
                      onCheckedChange={() => handleFieldToggle(field)}
                    />
                    <Label htmlFor={field}>
                      {field}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Achievements */}
          <Card>
            <CardContent>
              <h6 className="text-lg font-semibold mb-3">Achievements</h6>

              <div className="flex gap-2">
                <Input
                  value={newAchievement}
                  onChange={(e) => setNewAchievement(e.target.value)}
                  placeholder="Add an achievement"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAchievement())}
                />
                <Button type="button" onClick={addAchievement} size="sm">
                  <Plus />
                </Button>
              </div>

              {formData.achievements.length > 0 && (
                <div className="flex flex-col gap-2">
                  {formData.achievements.map((achievement, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-accent rounded-md">
                      <span className="flex-1 text-sm">{achievement}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAchievement(index)}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardContent>
              <h6 className="text-lg font-semibold mb-3">Tags</h6>

              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag} size="sm">
                  <Plus />
                </Button>
              </div>

              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {formData.tags.map((tag, index) => (
                    <Badge key={index} variant="outline">
                      {tag}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTag(index)}
                      >
                        <X />
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

        <PersonalitySelectionDialog
          open={selectionDialogOpen}
          onOpenChange={setSelectionDialogOpen}
          candidates={candidates}
          searchTerm={searchTerm}
          onSelect={handleCandidateSelection}
          loading={lookupLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
