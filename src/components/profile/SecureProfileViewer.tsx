import React from 'react';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { PrivacyGuard } from '@/components/security/PrivacyGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Briefcase, GraduationCap, Heart, MapPin, Globe, Phone, Shield } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SecureProfileViewerProps {
  profile: Record<string, unknown>;
  isOwnProfile: boolean;
}

export function SecureProfileViewer({ profile, isOwnProfile }: SecureProfileViewerProps) {
  const { isAdmin } = useAdminRoles();

  if (!profile) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Basic Information - Always visible for public profiles */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}
            >
              {/* Location - Privacy controlled */}
              <PrivacyGuard
                profileUserId={profile.user_id}
                requiredPrivacyField="location_public"
                privacySettings={profile.privacy_settings}
                adminJustification="location_verification"
              >
                {profile.location && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <MapPin style={{ height: 20, width: 20, color: 'var(--muted-foreground)' }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Location
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {profile.location}
                      </Typography>
                    </Box>
                  </Box>
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
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Pronouns
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {profile.pronouns}
                    </Typography>
                  </Box>
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Briefcase
                      style={{ height: 20, width: 20, color: 'var(--muted-foreground)' }}
                    />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Occupation
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {profile.occupation}
                      </Typography>
                    </Box>
                  </Box>
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <GraduationCap
                      style={{ height: 20, width: 20, color: 'var(--muted-foreground)' }}
                    />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Education
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {profile.education}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </PrivacyGuard>
            </Box>

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
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                        Interests
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {profile.interests.map((interest: string, index: number) => (
                          <Badge key={index} variant="secondary">
                            {interest}
                          </Badge>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                )}
            </PrivacyGuard>
          </Box>
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {profile.website && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Globe style={{ height: 20, width: 20, color: 'var(--muted-foreground)' }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Website
                    </Typography>
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--primary)', textDecoration: 'none' }}
                      onMouseOver={(e: React.MouseEvent<HTMLAnchorElement>) => {
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                      onMouseOut={(e: React.MouseEvent<HTMLAnchorElement>) => {
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                    >
                      {profile.website}
                    </a>
                  </Box>
                </Box>
              )}

              {/* Phone - Extra privacy protection */}
              <PrivacyGuard
                profileUserId={profile.user_id}
                requiredPrivacyField="phone_public"
                privacySettings={profile.privacy_settings}
                adminJustification="emergency_contact"
              >
                {profile.phone && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Phone style={{ height: 20, width: 20, color: 'var(--muted-foreground)' }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Phone
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {profile.phone}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </PrivacyGuard>
            </Box>
          </CardContent>
        </Card>
      </PrivacyGuard>

      {/* Sensitive Identity Information - Only for owners and emergency admin access */}
      {(isOwnProfile || isAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Shield style={{ height: 20, width: 20 }} />
                Sensitive Information
                {!isOwnProfile && <Badge variant="destructive">Admin Access</Badge>}
              </Box>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}
              >
                {/* Gender Identity - Highly sensitive */}
                <PrivacyGuard
                  profileUserId={profile.user_id}
                  requiredPrivacyField="gender_identity_public"
                  privacySettings={profile.privacy_settings}
                  adminJustification="identity_verification_critical"
                >
                  {profile.gender_identity && (
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Gender Identity
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {profile.gender_identity}
                      </Typography>
                    </Box>
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
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Sexual Orientation
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {profile.sexual_orientation}
                      </Typography>
                    </Box>
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Heart style={{ height: 20, width: 20, color: 'var(--muted-foreground)' }} />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          Relationship Status
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {profile.relationship_status}
                        </Typography>
                      </Box>
                    </Box>
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
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Income Range
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {profile.income_range}
                      </Typography>
                    </Box>
                  )}
                </PrivacyGuard>
              </Box>

              {!isOwnProfile && isAdmin && (
                <Box
                  sx={{
                    mt: 2,
                    p: 1.5,
                    bgcolor: 'error.main',
                    opacity: 0.1,
                    border: 1,
                    borderColor: 'error.main',
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 500 }}>
                    Admin Access: This sensitive information is logged and monitored for security
                    compliance.
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
