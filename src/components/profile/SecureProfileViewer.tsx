import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { PrivacyGuard } from '@/components/security/PrivacyGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Briefcase, 
  GraduationCap, 
  Heart, 
  MapPin,
  Globe,
  Phone,
  Shield
} from 'lucide-react';

interface SecureProfileViewerProps {
  profile: any;
  isOwnProfile: boolean;
}

export function SecureProfileViewer({ profile, isOwnProfile }: SecureProfileViewerProps) {
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();

  if (!profile) return null;

  return (
    <div className="space-y-6">
      {/* Basic Information - Always visible for public profiles */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Location - Privacy controlled */}
            <PrivacyGuard
              profileUserId={profile.user_id}
              requiredPrivacyField="location_public"
              privacySettings={profile.privacy_settings}
              adminJustification="location_verification"
            >
              {profile.location && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Location</p>
                    <p className="text-muted-foreground">{profile.location}</p>
                  </div>
                </div>
              )}
            </PrivacyGuard>

            {/* Pronouns - Privacy controlled */}
            <PrivacyGuard
              profileUserId={profile.user_id}
              requiredPrivacyField="pronouns_public"
              privacySettings={profile.privacy_settings}
              adminJustification="identity_verification"
            >
              {profile.pronouns && (
                <div>
                  <p className="font-medium">Pronouns</p>
                  <p className="text-muted-foreground">{profile.pronouns}</p>
                </div>
              )}
            </PrivacyGuard>

            {/* Occupation - Privacy controlled */}
            <PrivacyGuard
              profileUserId={profile.user_id}
              requiredPrivacyField="interests_public"
              privacySettings={profile.privacy_settings}
              adminJustification="profile_verification"
            >
              {profile.occupation && (
                <div className="flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Occupation</p>
                    <p className="text-muted-foreground">{profile.occupation}</p>
                  </div>
                </div>
              )}
            </PrivacyGuard>
            
            {/* Education - Privacy controlled */}
            <PrivacyGuard
              profileUserId={profile.user_id}
              requiredPrivacyField="interests_public"
              privacySettings={profile.privacy_settings}
              adminJustification="profile_verification"
            >
              {profile.education && (
                <div className="flex items-center gap-3">
                  <GraduationCap className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Education</p>
                    <p className="text-muted-foreground">{profile.education}</p>
                  </div>
                </div>
              )}
            </PrivacyGuard>
          </div>

          {/* Interests - Privacy controlled */}
          <PrivacyGuard
            profileUserId={profile.user_id}
            requiredPrivacyField="interests_public"
            privacySettings={profile.privacy_settings}
            adminJustification="profile_verification"
          >
            {profile.interests && Array.isArray(profile.interests) && profile.interests.length > 0 && (
              <div className="space-y-3">
                <div>
                  <h3 className="font-medium mb-2">Interests</h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.interests.map((interest: string, index: number) => (
                      <Badge key={index} variant="secondary">
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </PrivacyGuard>
        </CardContent>
      </Card>

      {/* Contact Information - Strictly privacy controlled */}
      <PrivacyGuard
        profileUserId={profile.user_id}
        requiredPrivacyField="contact_public"
        privacySettings={profile.privacy_settings}
        adminJustification="contact_verification"
      >
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.website && (
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Website</p>
                  <a 
                    href={profile.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {profile.website}
                  </a>
                </div>
              </div>
            )}

            {/* Phone - Extra privacy protection */}
            <PrivacyGuard
              profileUserId={profile.user_id}
              requiredPrivacyField="phone_public"
              privacySettings={profile.privacy_settings}
              adminJustification="emergency_contact"
            >
              {profile.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Phone</p>
                    <p className="text-muted-foreground">{profile.phone}</p>
                  </div>
                </div>
              )}
            </PrivacyGuard>
          </CardContent>
        </Card>
      </PrivacyGuard>

      {/* Sensitive Identity Information - Only for owners and emergency admin access */}
      {(isOwnProfile || isAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Sensitive Information
              {!isOwnProfile && (
                <Badge variant="destructive">Admin Access</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Gender Identity - Highly sensitive */}
              <PrivacyGuard
                profileUserId={profile.user_id}
                requiredPrivacyField="gender_identity_public"
                privacySettings={profile.privacy_settings}
                adminJustification="identity_verification_critical"
              >
                {profile.gender_identity && (
                  <div>
                    <p className="font-medium">Gender Identity</p>
                    <p className="text-muted-foreground">{profile.gender_identity}</p>
                  </div>
                )}
              </PrivacyGuard>

              {/* Sexual Orientation - Highly sensitive */}
              <PrivacyGuard
                profileUserId={profile.user_id}
                requiredPrivacyField="sexual_orientation_public"
                privacySettings={profile.privacy_settings}
                adminJustification="identity_verification_critical"
              >
                {profile.sexual_orientation && (
                  <div>
                    <p className="font-medium">Sexual Orientation</p>
                    <p className="text-muted-foreground">{profile.sexual_orientation}</p>
                  </div>
                )}
              </PrivacyGuard>

              {/* Relationship Status - Sensitive */}
              <PrivacyGuard
                profileUserId={profile.user_id}
                requiredPrivacyField="relationship_status_public"
                privacySettings={profile.privacy_settings}
                adminJustification="profile_moderation"
              >
                {profile.relationship_status && (
                  <div className="flex items-center gap-3">
                    <Heart className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Relationship Status</p>
                      <p className="text-muted-foreground">{profile.relationship_status}</p>
                    </div>
                  </div>
                )}
              </PrivacyGuard>

              {/* Income Range - Highly sensitive */}
              <PrivacyGuard
                profileUserId={profile.user_id}
                requiredPrivacyField="income_range_public"
                privacySettings={profile.privacy_settings}
                adminJustification="financial_verification"
              >
                {profile.income_range && (
                  <div>
                    <p className="font-medium">Income Range</p>
                    <p className="text-muted-foreground">{profile.income_range}</p>
                  </div>
                )}
              </PrivacyGuard>
            </div>

            {!isOwnProfile && isAdmin && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">
                  ⚠️ Admin Access: This sensitive information is logged and monitored for security compliance.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}