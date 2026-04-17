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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { stack } from '@/lib/sx';
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
    <Box sx={stack(3)}>
      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Avatar</CardTitle>
          <Typography variant="body2" color="text.secondary">
            Choose how you want to appear to other users. Upload your own photo, use our avatar builder, or connect your Gravatar account.
          </Typography>
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
          <Box sx={stack(2)}>
            {/* Name row */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
              <FormField id="first_name" label="First Name" value={formData.first_name} onChange={(v) => onChange('first_name', v)} placeholder="Your first name" />
              <FormField id="last_name" label="Last Name" value={formData.last_name} onChange={(v) => onChange('last_name', v)} placeholder="Your last name" />
              <FormField id="chosen_name" label="Preferred Name" value={formData.chosen_name} onChange={(v) => onChange('chosen_name', v)} placeholder="If different from legal name" description="Used when your legal name is required" />
            </Box>

            {/* Display name + pronouns + pronunciation */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
              <FormField id="display_name" label="Display Name" value={formData.display_name} onChange={(v) => onChange('display_name', v)} placeholder="How you appear to others" description="Shown on your profile and in conversations" />
              <FormField id="pronouns" label="Pronouns" value={formData.pronouns} onChange={(v) => onChange('pronouns', v)} placeholder="e.g., they/them, she/her, he/him" />
              <FormField id="name_pronunciation" label="Name Pronunciation" value={formData.name_pronunciation} onChange={(v) => onChange('name_pronunciation', v)} placeholder="e.g., toe-BEE-us" description="Help others pronounce your name" />
            </Box>

            {/* Bio */}
            <FormField id="bio" label="Bio" value={formData.bio} onChange={(v) => onChange('bio', v)} placeholder="Tell us about yourself..." multiline rows={3} />

            {/* Location + DOB */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <Box sx={stack(0.5)}>
                <Label htmlFor="location">Location</Label>
                <LocationAutocomplete
                  value={formData.location}
                  onChange={(value) => onChange('location', value)}
                  placeholder="Search for your city, country"
                />
              </Box>
              <Box sx={stack(0.5)}>
                <Label htmlFor="date_of_birth">Date of Birth</Label>
                <Box sx={{ display: 'flex', gap: 1 }}>
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
                      <Box sx={{ p: 1.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Select Date of Birth</Typography>
                        <Typography variant="caption" color="text.secondary">You must be at least 18 years old</Typography>
                      </Box>
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
                        <Box sx={{ p: 1.5 }}>
                          <Button variant="ghost" size="sm" onClick={() => onChange('date_of_birth', '')} style={{ width: '100%' }}>
                            <Typography variant="body2" color="text.secondary">Clear date</Typography>
                          </Button>
                        </Box>
                      )}
                    </PopoverContent>
                  </Popover>
                </Box>
                <Typography variant="caption" color="text.secondary">You must be at least 18 years old</Typography>
              </Box>
            </Box>

            {/* Occupation + Education */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <FormField id="occupation" label="Occupation" value={formData.occupation} onChange={(v) => onChange('occupation', v)} placeholder="What do you do?" />
              <FormField id="education" label="Education" value={formData.education} onChange={(v) => onChange('education', v)} placeholder="Your education background" />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Social Links */}
      <SocialLinksManager
        initialSocialLinks={profile?.social_links || {}}
        onUpdate={(socialLinks) => {
          console.log('Social links updated:', socialLinks);
        }}
      />
    </Box>
  );
}
