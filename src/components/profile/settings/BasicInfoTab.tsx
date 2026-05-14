import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarIcon } from 'lucide-react';
import { AvatarSettings } from '@/components/profile/AvatarSettings';
import { SocialLinksManager } from '@/components/profile/SocialLinksManager';
import { LocationAutocomplete } from '@/components/ui/location-autocomplete';
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
  onAvatarSave: (data: { avatarUrl?: string; avatarConfig?: Record<string, unknown>; avatarType?: string }) => void;
}

export function BasicInfoTab({ formData, profile, user, onChange, onAvatarSave }: BasicInfoTabProps) {
  const minAgeDate = getMinAgeDate();

  return (
    <div className="flex flex-col gap-6">
      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Avatar</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose how you want to appear to other users. Upload your own photo, use our avatar builder, or connect your Gravatar account.
          </p>
        </CardHeader>
        <CardContent>
          <AvatarSettings
            initialData={{
              avatarUrl: profile?.avatar_url,
              avatarConfig: profile?.avatar_config,
              avatarType: profile?.avatar_type as 'upload' | 'builder' | 'initials' | undefined,
              email: user?.email || '',
            }}
            onSave={onAvatarSave}
          />
        </CardContent>
      </Card>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Name row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField id="first_name" label="First Name" value={formData.first_name} onChange={(v) => onChange('first_name', v)} placeholder="Your first name" />
              <FormField id="last_name" label="Last Name" value={formData.last_name} onChange={(v) => onChange('last_name', v)} placeholder="Your last name" />
              <FormField id="chosen_name" label="Preferred Name" value={formData.chosen_name} onChange={(v) => onChange('chosen_name', v)} placeholder="If different from legal name" description="Used when your legal name is required" />
            </div>

            {/* Display name + pronouns + pronunciation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField id="display_name" label="Display Name" value={formData.display_name} onChange={(v) => onChange('display_name', v)} placeholder="How you appear to others" description="Shown on your profile and in conversations" />
              <FormField id="pronouns" label="Pronouns" value={formData.pronouns} onChange={(v) => onChange('pronouns', v)} placeholder="e.g., they/them, she/her, he/him" />
              <FormField id="name_pronunciation" label="Name Pronunciation" value={formData.name_pronunciation} onChange={(v) => onChange('name_pronunciation', v)} placeholder="e.g., toe-BEE-us" description="Help others pronounce your name" />
            </div>

            {/* Bio */}
            <FormField id="bio" label="Bio" value={formData.bio} onChange={(v) => onChange('bio', v)} placeholder="Tell us about yourself..." multiline rows={3} />

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
                      <Button variant="outline" size="icon" type="button" style={{ height: 40, width: 40, flexShrink: 0 }}>
                        <CalendarIcon style={{ width: 16, height: 16 }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent style={{ width: 'auto', padding: 0 }} align="start">
                      <div className="p-3">
                        <p className="text-sm font-medium">Select Date of Birth</p>
                        <p className="text-xs text-muted-foreground">You must be at least 18 years old</p>
                      </div>
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        selected={formData.date_of_birth ? new Date(formData.date_of_birth) : undefined}
                        onSelect={(date) => onChange('date_of_birth', date ? date.toISOString().split('T')[0] : '')}
                        disabled={(date) => date > minAgeDate || date < new Date('1900-01-01')}
                        fromYear={1930}
                        toYear={minAgeDate.getFullYear()}
                        defaultMonth={new Date(new Date().getFullYear() - 30, 0)}
                        initialFocus
                        style={{ padding: 12, pointerEvents: 'auto' }}
                      />
                      {formData.date_of_birth && (
                        <div className="p-3">
                          <Button variant="ghost" size="sm" onClick={() => onChange('date_of_birth', '')} style={{ width: '100%' }}>
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
              <FormField id="occupation" label="Occupation" value={formData.occupation} onChange={(v) => onChange('occupation', v)} placeholder="What do you do?" />
              <FormField id="education" label="Education" value={formData.education} onChange={(v) => onChange('education', v)} placeholder="Your education background" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <SocialLinksManager
        initialSocialLinks={profile?.social_links || {}}
        onUpdate={() => {
          // TODO: persist updates to profile.social_links via the profile
          // mutation hook. Component currently emits but the parent doesn't
          // catch — was a debug-only console.log.
        }}
      />
    </div>
  );
}
