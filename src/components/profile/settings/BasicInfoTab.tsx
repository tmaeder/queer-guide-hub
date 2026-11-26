import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, PenLine, Quote, User as UserIcon } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SocialLinksManager } from '@/components/profile/SocialLinksManager';
import { LocationAutocomplete } from '@/components/ui/location-autocomplete';
import { PronounCombobox } from '@/components/ui/pronoun-combobox';
import { ProfessionAutocomplete } from '@/components/ui/profession-autocomplete';
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
  /** Unused since pronoun visibility moved to Privacy; kept for existing callers. */
  onPrivacyChange?: (field: string, value: string | boolean) => void;
}

export function BasicInfoTab({
  formData,
  profile,
  user,
  onChange,
  onPronounTagsChange,
}: BasicInfoTabProps) {
  const minAgeDate = getMinAgeDate();
  void user; // kept in the prop contract for sheet parents; avatar moved to the identity card

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle icon={UserIcon}>Name</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FormField
              id="first_name"
              label="First name"
              value={formData.first_name}
              onChange={(v) => onChange('first_name', v)}
            />
            <FormField
              id="last_name"
              label="Last name"
              value={formData.last_name}
              onChange={(v) => onChange('last_name', v)}
            />
            <FormField
              id="chosen_name"
              label="Preferred name"
              value={formData.chosen_name}
              onChange={(v) => onChange('chosen_name', v)}
              placeholder="If different"
            />
          </div>
          <FormField
            id="name_pronunciation"
            label="How to say it"
            value={formData.name_pronunciation}
            onChange={(v) => onChange('name_pronunciation', v)}
            placeholder="e.g. toe-BEE-us"
          />
        </CardContent>
      </Card>

      {/* Public identity is the @username handle (Sign-in & security);
          there is no separate display name. */}
      <Card>
        <CardHeader>
          <CardTitle icon={Quote}>Pronouns</CardTitle>
          <p className="text-sm text-muted-foreground">Who sees them is set under Privacy.</p>
        </CardHeader>
        <CardContent>
          <Label htmlFor="pronouns" className="sr-only">
            Pronouns
          </Label>
          <PronounCombobox
            id="pronouns"
            value={formData.pronoun_tags}
            onValueChange={onPronounTagsChange}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle icon={PenLine}>About me</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField
            id="bio"
            label="About me"
            hideLabel
            value={formData.bio}
            onChange={(v) => onChange('bio', v)}
            placeholder="A few lines about you."
            multiline
            rows={4}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle icon={ClipboardList}>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LocationAutocomplete
            value={formData.location}
            onChange={(value) => onChange('location', value)}
            placeholder="City, country"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="date_of_birth">Date of birth (18+)</Label>
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
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="occupation">Occupation</Label>
            <ProfessionAutocomplete
              id="occupation"
              value={formData.occupation}
              onValueChange={(v) => onChange('occupation', v)}
              placeholder="Pick one or type your own"
            />
          </div>
          <FormField
            id="education"
            label="Education"
            value={formData.education}
            onChange={(v) => onChange('education', v)}
          />
        </CardContent>
      </Card>

      {/* Social Links */}
      <SocialLinksManager
        initialSocialLinks={profile?.social_links || {}}
        initialSocialAccounts={(profile as { social_accounts?: unknown })?.social_accounts}
        onUpdate={() => {
          // Deliberately empty, and NOT a missing persist. SocialLinksManager
          // writes `social_accounts` + `social_links` to `profiles` itself in
          // its own `save()` and only then fires this, so `onUpdate` is a
          // post-save notification — nothing is dropped here. The previous TODO
          // said the parent "doesn't catch" and read as data loss, which sent
          // this review hunting a bug that was somewhere else entirely: the real
          // defect was that `authenticated` held no UPDATE grant on either
          // column after 20540101100000, so every save failed 42501 behind a
          // generic toast (fixed in 99991793214012).
          //
          // Adding a parent-side write would make this a SECOND writer of the
          // same two columns, which is the hazard this repo keeps paying for.
          // If the editor ever needs to re-render from the saved values, refetch
          // through `get_my_profile()` rather than writing again.
        }}
      />
    </div>
  );
}
