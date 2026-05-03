import React from 'react';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { PrivacyGuard } from '@/components/security/PrivacyGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Briefcase, GraduationCap, Heart, MapPin, Globe, Phone, Shield } from 'lucide-react';

interface SecureProfileViewerProps {
  profile: Record<string, unknown>;
  isOwnProfile: boolean;
}

export function SecureProfileViewer({ profile, isOwnProfile }: SecureProfileViewerProps) {
  const { isAdmin } = useAdminRoles();

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Basic Information - Always visible for public profiles */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
                      <p className="text-sm font-medium">Location</p>
                      <p className="text-sm text-muted-foreground">{profile.location}</p>
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
                    <p className="text-sm font-medium">Pronouns</p>
                    <p className="text-sm text-muted-foreground">{profile.pronouns}</p>
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
                      <p className="text-sm font-medium">Occupation</p>
                      <p className="text-sm text-muted-foreground">{profile.occupation}</p>
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
                      <p className="text-sm font-medium">Education</p>
                      <p className="text-sm text-muted-foreground">{profile.education}</p>
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
              {profile.interests &&
                Array.isArray(profile.interests) &&
                profile.interests.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-base font-medium mb-2">Interests</p>
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
          </div>
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
          <CardContent>
            <div className="flex flex-col gap-4">
              {profile.website && (
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Website</p>
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary no-underline hover:underline"
                      onMouseOver={(e: React.MouseEvent<HTMLAnchorElement>) => {
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                      onMouseOut={(e: React.MouseEvent<HTMLAnchorElement>) => {
                        e.currentTarget.style.textDecoration = 'none';
                      }}
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
                      <p className="text-sm font-medium">Phone</p>
                      <p className="text-sm text-muted-foreground">{profile.phone}</p>
                    </div>
                  </div>
                )}
              </PrivacyGuard>
            </div>
          </CardContent>
        </Card>
      </PrivacyGuard>

      {/* Sensitive Identity Information - Only for owners and emergency admin access */}
      {(isOwnProfile || isAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Sensitive Information
                {!isOwnProfile && <Badge variant="destructive">Admin Access</Badge>}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {/* Gender Identity - Highly sensitive */}
                <PrivacyGuard
                  profileUserId={profile.user_id}
                  requiredPrivacyField="gender_identity_public"
                  privacySettings={profile.privacy_settings}
                  adminJustification="identity_verification_critical"
                >
                  {profile.gender_identity && (
                    <div>
                      <p className="text-sm font-medium">Gender Identity</p>
                      <p className="text-sm text-muted-foreground">{profile.gender_identity}</p>
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
                      <p className="text-sm font-medium">Sexual Orientation</p>
                      <p className="text-sm text-muted-foreground">{profile.sexual_orientation}</p>
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
                        <p className="text-sm font-medium">Relationship Status</p>
                        <p className="text-sm text-muted-foreground">{profile.relationship_status}</p>
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
                      <p className="text-sm font-medium">Income Range</p>
                      <p className="text-sm text-muted-foreground">{profile.income_range}</p>
                    </div>
                  )}
                </PrivacyGuard>
              </div>

              {!isOwnProfile && isAdmin && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-lg">
                  <p className="text-sm text-destructive font-medium">
                    Admin Access: This sensitive information is logged and monitored for security
                    compliance.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
