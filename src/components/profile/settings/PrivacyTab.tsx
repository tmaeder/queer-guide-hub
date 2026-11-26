import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SwitchField } from './fields';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import type { ProfileFormData } from '@/types/profileForm';
import {
  Briefcase,
  Cake,
  Eye,
  Fingerprint,
  Flag,
  HeartHandshake,
  History,
  KeyRound,
  Link,
  MapPin,
  PenLine,
  Plane,
  Quote,
  Rss,
  Shield,
  User,
  Users,
  type LucideIcon,
} from '@/components/icons';

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
  showVisibility?: boolean;
  showSecurity?: boolean;
  focusField?: string;
}

function VisibilityRow({
  id,
  icon: Icon,
  label,
  description,
  value,
  onChange,
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 gap-2.5">
        <Icon size={18} aria-hidden className="mt-px shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <Label htmlFor={id}>
            <span className="text-sm font-medium">{label}</span>
          </Label>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full sm:w-40 sm:shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VISIBILITY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PrivacyTab({
  formData,
  hasPasskey,
  onPrivacyChange,
  showVisibility = true,
  showSecurity = true,
  focusField,
}: PrivacyTabProps) {
  const ps = formData.privacy_settings;
  useEffect(() => {
    if (!focusField) return;
    const control = document.getElementById(focusField);
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({ block: 'nearest' });
  }, [focusField]);

  return (
    <div className="flex flex-col gap-6">
      {/* Profile Visibility */}
      {showVisibility && (
        <Card>
          <CardHeader>
            <CardTitle icon={Eye}>Who sees each part of your profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <VisibilityRow
                id="profile_visibility"
                icon={User}
                label="Whole profile"
                description="The rows below can only narrow this. Even when private, signed-in members see your username, avatar, mode and join date."
                value={normalizeVisibility(ps.profile_visibility, 'community')}
                onChange={(v) => onPrivacyChange('profile_visibility', v)}
              />
              <VisibilityRow
                id="pronouns_visibility"
                icon={Quote}
                label="Pronouns"
                value={normalizeVisibility(ps.pronouns_visibility, 'public')}
                onChange={(v) => onPrivacyChange('pronouns_visibility', v)}
              />
              <VisibilityRow
                id="flags_visibility"
                icon={Flag}
                label="Pride flags"
                description="Flags on your profile"
                value={normalizeVisibility(ps.flags_visibility, 'public')}
                onChange={(v) => onPrivacyChange('flags_visibility', v)}
              />
              <VisibilityRow
                id="location_visibility"
                icon={MapPin}
                label="Location"
                value={normalizeVisibility(ps.location_visibility, 'public')}
                onChange={(v) => onPrivacyChange('location_visibility', v)}
              />
              <VisibilityRow
                id="contact_visibility"
                icon={Link}
                label="Links & contact"
                description="Website and social links"
                value={normalizeVisibility(ps.contact_visibility, 'friends')}
                onChange={(v) => onPrivacyChange('contact_visibility', v)}
              />
              <VisibilityRow
                id="interests_visibility"
                icon={Briefcase}
                label="Interests & work"
                description="Interests, occupation, education"
                value={normalizeVisibility(ps.interests_visibility, 'community')}
                onChange={(v) => onPrivacyChange('interests_visibility', v)}
              />
              <VisibilityRow
                id="identity_visibility"
                icon={Fingerprint}
                label="Identity"
                description="Gender, orientation, chosen family"
                value={normalizeVisibility(ps.identity_visibility, 'community')}
                onChange={(v) => onPrivacyChange('identity_visibility', v)}
              />
              <VisibilityRow
                id="relationships_visibility"
                icon={HeartHandshake}
                label="Relationships"
                description="Relationship details"
                value={normalizeVisibility(ps.relationships_visibility, 'community')}
                onChange={(v) => onPrivacyChange('relationships_visibility', v)}
              />
              <VisibilityRow
                id="travel_visibility"
                icon={Plane}
                label="Travel"
                description="Travel tab; each stat can be hidden on the tab itself"
                value={normalizeVisibility(ps.travel_visibility, 'public')}
                onChange={(v) => onPrivacyChange('travel_visibility', v)}
              />
              <VisibilityRow
                id="contributions_visibility"
                icon={PenLine}
                label="Contributions"
                description="Posts, reviews and photos"
                value={normalizeVisibility(ps.contributions_visibility, 'public')}
                onChange={(v) => onPrivacyChange('contributions_visibility', v)}
              />
              <VisibilityRow
                id="social_visibility"
                icon={Users}
                label="Community summary"
                description="Friends and groups counts"
                value={normalizeVisibility(ps.social_visibility, 'community')}
                onChange={(v) => onPrivacyChange('social_visibility', v)}
              />
              <VisibilityRow
                id="activity_visibility"
                icon={History}
                label="Recent activity"
                description="Recent activity feed (off by default)"
                value={normalizeVisibility(ps.activity_visibility, 'private')}
                onChange={(v) => onPrivacyChange('activity_visibility', v)}
              />
              <p className="text-xs text-muted-foreground">
                Your email and phone number are never shown on your public profile.
              </p>
              <SwitchField
                id="birthday_visibility"
                icon={Cake}
                label="Share birthday with friends"
                description="Friends see the month and day on their hub calendar. Your birth year and age are never shown."
                checked={ps.birthday_visibility === 'friends'}
                onChange={(v) => onPrivacyChange('birthday_visibility', v ? 'friends' : 'private')}
              />
              <SwitchField
                id="open_web"
                icon={Rss}
                label="Open web"
                description="Publish your public posts as an Atom feed and let fediverse apps find you as @handle@queer.guide. Posts with content warnings are never included. Needs a public profile."
                checked={ps.open_web === true}
                onChange={(v) => onPrivacyChange('open_web', v)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security */}
      {showSecurity && (
        <Card>
          <CardHeader>
            <CardTitle icon={Shield}>Security Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <Label className="flex items-center gap-2.5">
                  <KeyRound size={18} aria-hidden className="shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">Passkey Authentication</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  {hasPasskey
                    ? 'Passkey is enabled for secure login'
                    : 'Add a passkey for enhanced security'}
                </p>
              </div>
              <PasskeyButton mode="enroll" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
