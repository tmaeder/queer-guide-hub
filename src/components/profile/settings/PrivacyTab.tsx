import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SwitchField } from './fields';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import { RecognitionMailingForm } from '@/components/profile/RecognitionMailingForm';
import type { ProfileFormData } from '@/types/profileForm';

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'community', label: 'Community (signed-in members)' },
  { value: 'friends', label: 'Friends' },
  { value: 'private', label: 'Private' },
];

function normalizeVisibility(v: string | undefined, fallback: string): string {
  return v || fallback;
}

interface PrivacyTabProps {
  formData: ProfileFormData;
  hasPasskey: boolean;
  onPrivacyChange: (field: string, value: string | boolean) => void;
}

function VisibilityRow({ id, label, description, value, onChange }: {
  id: string; label: string; description: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id}>
          <span className="text-sm font-medium">{label}</span>
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger style={{ width: 128 }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VISIBILITY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PrivacyTab({ formData, hasPasskey, onPrivacyChange }: PrivacyTabProps) {
  const ps = formData.privacy_settings;

  return (
    <div className="flex flex-col gap-6">
      {/* Profile Visibility */}
      <Card>
        <CardHeader>
          <CardTitle>Privacy Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <VisibilityRow
              id="profile_visibility"
              label="Profile Visibility"
              description="Who can see your profile"
              value={normalizeVisibility(ps.profile_visibility, 'private')}
              onChange={(v) => onPrivacyChange('profile_visibility', v)}
            />
            <VisibilityRow
              id="pronouns_visibility"
              label="Pronouns"
              description="Who can see your pronouns"
              value={normalizeVisibility(ps.pronouns_visibility, 'public')}
              onChange={(v) => onPrivacyChange('pronouns_visibility', v)}
            />
            <VisibilityRow
              id="location_visibility"
              label="Location"
              description="Who can see your location"
              value={normalizeVisibility(ps.location_visibility, 'public')}
              onChange={(v) => onPrivacyChange('location_visibility', v)}
            />
            <VisibilityRow
              id="contact_visibility"
              label="Links & contact"
              description="Who can see your website and social links"
              value={normalizeVisibility(ps.contact_visibility, 'friends')}
              onChange={(v) => onPrivacyChange('contact_visibility', v)}
            />
            <VisibilityRow
              id="interests_visibility"
              label="Interests & work"
              description="Who can see your interests, occupation, education"
              value={normalizeVisibility(ps.interests_visibility, 'community')}
              onChange={(v) => onPrivacyChange('interests_visibility', v)}
            />
            <VisibilityRow
              id="identity_visibility"
              label="Identity Information"
              description="Who can see gender, orientation, chosen family"
              value={normalizeVisibility(ps.identity_visibility, 'community')}
              onChange={(v) => onPrivacyChange('identity_visibility', v)}
            />
            <VisibilityRow
              id="relationships_visibility"
              label="Relationship Information"
              description="Who can see relationship details"
              value={normalizeVisibility(ps.relationships_visibility, 'community')}
              onChange={(v) => onPrivacyChange('relationships_visibility', v)}
            />
            <VisibilityRow
              id="travel_visibility"
              label="Travel"
              description="Who can see your travel tab (per-stat sharing on the Travel tab itself)"
              value={normalizeVisibility(ps.travel_visibility, 'public')}
              onChange={(v) => onPrivacyChange('travel_visibility', v)}
            />
            <VisibilityRow
              id="contributions_visibility"
              label="Contributions"
              description="Who can see your posts, reviews, and photos"
              value={normalizeVisibility(ps.contributions_visibility, 'public')}
              onChange={(v) => onPrivacyChange('contributions_visibility', v)}
            />
            <VisibilityRow
              id="social_visibility"
              label="Community summary"
              description="Who can see your friends and groups counts"
              value={normalizeVisibility(ps.social_visibility, 'community')}
              onChange={(v) => onPrivacyChange('social_visibility', v)}
            />
            <VisibilityRow
              id="activity_visibility"
              label="Recent activity"
              description="Who can see your recent activity feed (off by default)"
              value={normalizeVisibility(ps.activity_visibility, 'private')}
              onChange={(v) => onPrivacyChange('activity_visibility', v)}
            />
            <p className="text-xs text-muted-foreground">
              Your email and phone number are never shown on your public profile.
            </p>
            <SwitchField
              id="birthday_visibility"
              label="Share birthday with friends"
              description="Friends see the month and day on their hub calendar. Your birth year and age are never shown."
              checked={ps.birthday_visibility === 'friends'}
              onChange={(v) => onPrivacyChange('birthday_visibility', v ? 'friends' : 'private')}
            />
            <SwitchField
              id="appear_in_recognition"
              label="Appear in annual recognition page"
              description="If selected by the editorial team, your name may appear on the /contributors/:year page. Default off."
              checked={!!ps.appear_in_recognition}
              onChange={(v) => onPrivacyChange('appear_in_recognition', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle>Security Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>
                <span className="text-sm font-medium">Passkey Authentication</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                {hasPasskey ? 'Passkey is enabled for secure login' : 'Add a passkey for enhanced security'}
              </p>
            </div>
            <PasskeyButton mode="enroll" />
          </div>
        </CardContent>
      </Card>

      {ps.appear_in_recognition && <RecognitionMailingForm />}
    </div>
  );
}
