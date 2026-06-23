import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarIcon } from 'lucide-react';
import { SocialLinksManager } from '@/components/profile/SocialLinksManager';
import { LocationAutocomplete } from '@/components/ui/location-autocomplete';
import { PronounCombobox } from '@/components/ui/pronoun-combobox';
import { ProfessionAutocomplete } from '@/components/ui/profession-autocomplete';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from './fields';
import { getMinAgeDate, isValidDob } from '@/types/profileForm';
import type { ProfileFormData } from '@/types/profileForm';
import type { Profile } from '@/hooks/useProfile';
import type { User } from '@supabase/supabase-js';

interface BasicInfoTabProps {
  formData: ProfileFormData;
  profile: Profile | null | undefined;
  user: User;
  onChange: (field: string, value: string) => void;
  onPronounTagsChange: (tags: string[]) => void;
  onPrivacyChange: (field: string, value: string | boolean) => void;
}

export function BasicInfoTab({
  formData,
  profile,
  user,
  onChange,
  onPronounTagsChange,
  onPrivacyChange,
}: BasicInfoTabProps) {
  const minAgeDate = getMinAgeDate();
  void user; // kept in the prop contract for sheet parents; avatar moved to the identity card

  return (
    <div className="flex flex-col gap-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Name row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                id="first_name"
                label="First Name"
                value={formData.first_name}
                onChange={(v) => onChange('first_name', v)}
                placeholder="Your first name"
              />
              <FormField
                id="last_name"
                label="Last Name"
                value={formData.last_name}
                onChange={(v) => onChange('last_name', v)}
                placeholder="Your last name"
              />
              <FormField
                id="chosen_name"
                label="Preferred Name"
                value={formData.chosen_name}
                onChange={(v) => onChange('chosen_name', v)}
                placeholder="If different from legal name"
                description="Used when your legal name is required"
              />
            </div>

            {/* Display name + pronouns + pronunciation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                id="display_name"
                label="Display Name"
                value={formData.display_name}
                onChange={(v) => onChange('display_name', v)}
                placeholder="How you appear to others"
                description="Shown on your profile and in conversations"
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor="pronouns">Pronouns</Label>
                <PronounCombobox
                  id="pronouns"
                  value={formData.pronoun_tags}
                  onValueChange={onPronounTagsChange}
                />
                <div className="flex items-center gap-2 mt-1">
                  <Label htmlFor="pronouns-visibility" className="text-xs text-muted-foreground shrink-0">
                    Visible to
                  </Label>
                  <Select
                    value={formData.privacy_settings.pronouns_visibility ?? 'public'}
                    onValueChange={(v) => onPrivacyChange('pronouns_visibility', v)}
                  >
                    <SelectTrigger id="pronouns-visibility" className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Anyone</SelectItem>
                      <SelectItem value="friends">Community</SelectItem>
                      <SelectItem value="private">Only me</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <FormField
                id="name_pronunciation"
                label="Name Pronunciation"
                value={formData.name_pronunciation}
                onChange={(v) => onChange('name_pronunciation', v)}
                placeholder="e.g., toe-BEE-us"
                description="Help others pronounce your name"
              />
            </div>

            {/* Bio */}
            <FormField
              id="bio"
              label="Bio"
              value={formData.bio}
              onChange={(v) => onChange('bio', v)}
              placeholder="Tell us about yourself..."
              multiline
              rows={3}
            />

            {/* Location + DOB */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="location">Location</Label>
                <LocationAutocomplete
                  value={formData.location}
                  onChange={(value) => onChange('location', value)}
                  placeholder="Search for your city, country"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="date_of_birth">Date of Birth</Label>
                <div className="flex gap-2">
                  <Input
                    id="date_of_birth"
                    type="date"
                    value={formData.date_of_birth || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val || isValidDob(val)) onChange('date_of_birth', val || '');
                    }}
                    max={minAgeDate.toISOString().split('T')[0]}
                    min="1900-01-01"
                    style={{ flex: 1 }}
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        type="button"
                        style={{ height: 40, width: 40 }}
                        className="shrink-0"
                      >
                        <CalendarIcon size={16} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent style={{ width: 'auto' }} className="p-0" align="start">
                      <div className="p-4">
                        <p className="text-sm font-medium">Select Date of Birth</p>
                        <p className="text-xs text-muted-foreground">
                          You must be at least 18 years old
                        </p>
                      </div>
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        selected={
                          formData.date_of_birth ? new Date(formData.date_of_birth) : undefined
                        }
                        onSelect={(date) =>
                          onChange('date_of_birth', date ? date.toISOString().split('T')[0] : '')
                        }
                        disabled={(date) => date > minAgeDate || date < new Date('1900-01-01')}
                        fromYear={1930}
                        toYear={minAgeDate.getFullYear()}
                        defaultMonth={new Date(new Date().getFullYear() - 30, 0)}
                        initialFocus
                        style={{ padding: 12, pointerEvents: 'auto' }}
                      />
                      {formData.date_of_birth && (
                        <div className="p-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onChange('date_of_birth', '')}
                            style={{ width: '100%' }}
                          >
                            <span className="text-sm text-muted-foreground">Clear date</span>
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <p className="text-xs text-muted-foreground">You must be at least 18 years old</p>
              </div>
            </div>

            {/* Occupation + Education */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="occupation">Occupation</Label>
                <ProfessionAutocomplete
                  id="occupation"
                  value={formData.occupation}
                  onValueChange={(v) => onChange('occupation', v)}
                  placeholder="Pick one or type your own"
                />
                <p className="text-xs text-muted-foreground">
                  Stored exactly as you write it.
                </p>
              </div>
              <FormField
                id="education"
                label="Education"
                value={formData.education}
                onChange={(v) => onChange('education', v)}
                placeholder="Your education background"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <SocialLinksManager
        initialSocialLinks={profile?.social_links || {}}
        initialSocialAccounts={(profile as { social_accounts?: unknown })?.social_accounts}
        onUpdate={() => {
          // TODO: persist updates to profile.social_links via the profile
          // mutation hook. Component currently emits but the parent doesn't
          // catch — was a debug-only console.log.
        }}
      />
    </div>
  );
}
