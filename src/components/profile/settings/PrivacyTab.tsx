import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SwitchField } from './fields';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import type { ProfileFormData } from '@/types/profileForm';

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends' },
  { value: 'private', label: 'Private' },
];

interface PrivacyTabProps {
  formData: ProfileFormData;
  hasPasskey: boolean;
  onPrivacyChange: (field: string, value: string | boolean) => void;
}

function VisibilityRow({ id, label, description, value, onChange }: {
  id: string; label: string; description: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <div>
        <Label htmlFor={id}>
          <p className="text-sm font-medium">{label}</p>
        </Label>
        <span className="text-xs text-muted-foreground">{description}</span>
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
              value={ps.profile_visibility}
              onChange={(v) => onPrivacyChange('profile_visibility', v)}
            />
            <VisibilityRow
              id="identity_visibility"
              label="Identity Information"
              description="Who can see gender, orientation, chosen family"
              value={ps.identity_visibility || 'friends'}
              onChange={(v) => onPrivacyChange('identity_visibility', v)}
            />
            <VisibilityRow
              id="relationships_visibility"
              label="Relationship Information"
              description="Who can see relationship and intimacy details"
              value={ps.relationships_visibility || 'friends'}
              onChange={(v) => onPrivacyChange('relationships_visibility', v)}
            />
            <VisibilityRow
              id="travel_visibility"
              label="Travel Preferences"
              description="Who can see your travel preferences"
              value={ps.travel_visibility || 'public'}
              onChange={(v) => onPrivacyChange('travel_visibility', v)}
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
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle>Security Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row items-center justify-between gap-4">
            <div>
              <Label>
                <p className="text-sm font-medium">Passkey Authentication</p>
              </Label>
              <span className="text-xs text-muted-foreground">
                {hasPasskey ? 'Passkey is enabled for secure login' : 'Add a passkey for enhanced security'}
              </span>
            </div>
            <PasskeyButton mode="enroll" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
