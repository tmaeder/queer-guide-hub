import { useState, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
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
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectionDialogOpen, setSelectionDialogOpen] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string; description?: string }>>([]);

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

    console.log('=== SUBMIT STARTED ===');
    console.log('Form data:', formData);

    if (!formData.name.trim()) {
      console.log('Name validation failed');
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      console.log('Calling createPersonality...');
      const personalityData: Record<string, unknown> = {
        ...formData,
        social_links: {},
      };
      // Attach resolved FK IDs
      if (resolvedCountryId) personalityData.country_id = resolvedCountryId;
      if (resolvedCityId) personalityData.city_id = resolvedCityId;
      console.log('Personality data to create:', personalityData);

      await createPersonality(personalityData);

      console.log('Personality created successfully');

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
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>Quick Lookup</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              Search Wikipedia/Wikidata to automatically prefill personality information
            </Typography>

            <Box sx={{ display: 'flex', gap: 1 }}>
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
            </Box>
          </CardContent>
        </Card>

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
            {/* Basic Information */}
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>Basic Information</Typography>

                <Box>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Full name"
                    required
                  />
                </Box>

                <Box>
                  <Label htmlFor="pronouns">Pronouns</Label>
                  <Input
                    id="pronouns"
                    value={formData.pronouns}
                    onChange={(e) => setFormData(prev => ({ ...prev, pronouns: e.target.value }))}
                    placeholder="e.g., they/them, she/her, he/him"
                  />
                </Box>

                <Box>
                  <Label htmlFor="profession">Profession</Label>
                  <Input
                    id="profession"
                    value={formData.profession}
                    onChange={(e) => setFormData(prev => ({ ...prev, profession: e.target.value }))}
                    placeholder="Primary profession or role"
                  />
                </Box>

                <Box>
                  <Label htmlFor="nationality">Nationality</Label>
                  <CountryAutocomplete
                    id="nationality"
                    value={formData.nationality}
                    onValueChange={handleNationalityChange}
                    placeholder="Select country / nationality..."
                  />
                  {resolvedCountryName && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                      <Check style={{ width: 12, height: 12, color: '#22c55e' }} />
                      <Typography variant="caption" sx={{ color: '#22c55e' }}>
                        Linked to {resolvedCountryName}
                      </Typography>
                    </Box>
                  )}
                </Box>

                <Box>
                  <Label htmlFor="birth_place">Birth Place</Label>
                  <Box sx={{ position: 'relative' }}>
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
                  </Box>
                  {resolvedCityId && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                      <Check style={{ width: 12, height: 12, color: '#22c55e' }} />
                      <Typography variant="caption" sx={{ color: '#22c55e' }}>
                        City linked in database
                      </Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>

            {/* Dates and Status */}
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>Dates & Status</Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="is_living"
                    checked={formData.is_living}
                    onCheckedChange={(checked) =>
                      setFormData(prev => ({ ...prev, is_living: !!checked }))
                    }
                  />
                  <Label htmlFor="is_living">Currently living</Label>
                </Box>

                <Box>
                  <Label htmlFor="birth_date">Birth Date</Label>
                  <Input
                    id="birth_date"
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, birth_date: e.target.value }))}
                  />
                </Box>

                {!formData.is_living && (
                  <Box>
                    <Label htmlFor="death_date">Death Date</Label>
                    <Input
                      id="death_date"
                      type="date"
                      value={formData.death_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, death_date: e.target.value }))}
                    />
                  </Box>
                )}

                <Box>
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
                </Box>

                {/* Image Upload */}
                <Box>
                  <Label>Profile Image</Label>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {formData.image_url ? (
                      <Box sx={{ position: 'relative' }}>
                        <Box
                          component="img"
                          src={formData.image_url}
                          alt="Preview"
                          sx={{ width: '128px', height: '128px', objectFit: 'cover', borderRadius: 2, border: 1, borderColor: 'divider' }}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"

                          onClick={removeImage}
                        >
                          <X />
                        </Button>
                      </Box>
                    ) : (
                      <Box sx={{ border: 2, borderStyle: 'dashed', borderColor: 'text.secondary', borderRadius: 2, p: 3, textAlign: 'center' }}>
                        <ImageIcon />
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>No image uploaded</Typography>
                      </Box>
                    )}

                    <Box sx={{ display: 'flex', gap: 1 }}>
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
                      <Box
                        component="input"
                        id="image-upload"
                        type="file"
                        accept="image/*"
                        sx={{ display: 'none' }}
                        onChange={handleImageUpload}
                      />
                    </Box>

                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Or enter URL manually:
                    </Typography>
                    <Input
                      value={formData.image_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </Box>
                </Box>

                <Box>
                  <Label htmlFor="website_url">Website URL</Label>
                  <Input
                    id="website_url"
                    value={formData.website_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, website_url: e.target.value }))}
                    placeholder="https://..."
                  />
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Description and Bio */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>Description & Biography</Typography>

              <Box>
                <Label htmlFor="description">Short Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description (1-2 sentences)"
                  rows={2}
                />
              </Box>

              <Box>
                <Label htmlFor="bio">Biography</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                  placeholder="Detailed biography"
                  rows={4}
                />
              </Box>
            </CardContent>
          </Card>

          {/* Fields of Work */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>Fields of Work</Typography>

              {formData.fields.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
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
                </Box>
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, maxHeight: '128px', overflowY: 'auto' }}>
                {FIELD_OPTIONS.map((field) => (
                  <Box key={field} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Checkbox
                      id={field}
                      checked={formData.fields.includes(field)}
                      onCheckedChange={() => handleFieldToggle(field)}
                    />
                    <Label htmlFor={field}>
                      {field}
                    </Label>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>

          {/* Achievements */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>Achievements</Typography>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Input
                  value={newAchievement}
                  onChange={(e) => setNewAchievement(e.target.value)}
                  placeholder="Add an achievement"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAchievement())}
                />
                <Button type="button" onClick={addAchievement} size="sm">
                  <Plus />
                </Button>
              </Box>

              {formData.achievements.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {formData.achievements.map((achievement, index) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography component="span" variant="body2" sx={{ flex: 1 }}>{achievement}</Typography>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAchievement(index)}
                      >
                        <X />
                      </Button>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>Tags</Typography>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag} size="sm">
                  <Plus />
                </Button>
              </Box>

              {formData.tags.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
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
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, pt: 2 }}>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Personality'}
            </Button>
          </Box>
        </Box>

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
