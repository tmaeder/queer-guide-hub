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
            <SwitchField
              id="email_visible"
              label="Show Email"
              description="Display your email on your profile"
              checked={!!ps.email_visible}
              onChange={(v) => onPrivacyChange('email_visible', v)}
            />
            <SwitchField
              id="phone_visible"
              label="Show Phone"
              description="Display your phone number on your profile"
              checked={!!ps.phone_visible}
              onChange={(v) => onPrivacyChange('phone_visible', v)}
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
