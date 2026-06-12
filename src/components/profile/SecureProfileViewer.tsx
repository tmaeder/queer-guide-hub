import { useAdminRoles } from '@/hooks/useAdminRoles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Briefcase, GraduationCap, Heart, MapPin, Globe, Phone, Shield } from 'lucide-react';

interface SecureProfileViewerProps {
  profile: Record<string, unknown>;
  isOwnProfile: boolean;
}

// Visibility is enforced server-side: for other users' profiles the data comes
// from get_public_profile_safe, which only includes a field when the viewer is
// allowed to see it (per-field *_public flags, identity/relationships section
// visibility, friends checks). Presence of a value IS the authorization — the
// old client-side PrivacyGuard re-check ran against privacy_settings the RPC
// never returned, so permitted fields were never rendered for other viewers.
export function SecureProfileViewer({ profile, isOwnProfile }: SecureProfileViewerProps) {
  const { isAdmin } = useAdminRoles();

  if (!profile) return null;

  const str = (key: string) => {
    const v = profile[key];
    return typeof v === 'string' && v.trim() ? v : null;
  };

  const location = str('location');
  const pronouns = str('pronouns');
  const occupation = str('occupation');
  const education = str('education');
  const website = str('website');
  const phone = str('phone');
  const genderIdentity = str('gender_identity');
  const sexualOrientation = str('sexual_orientation');
  const relationshipStatus = str('current_relationship_status');
  const interests =
    Array.isArray(profile.interests) && profile.interests.length > 0
      ? (profile.interests as string[])
      : null;

  const hasSensitive = genderIdentity || sexualOrientation || relationshipStatus;

  return (
    <div className="flex flex-col gap-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {location && (
                <div className="flex items-center gap-4">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Location</p>
                    <p className="text-sm text-muted-foreground">{location}</p>
                  </div>
                </div>
              )}

              {pronouns && (
                <div>
                  <p className="text-sm font-medium">Pronouns</p>
                  <p className="text-sm text-muted-foreground">{pronouns}</p>
                </div>
              )}

              {occupation && (
                <div className="flex items-center gap-4">
                  <Briefcase className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Occupation</p>
                    <p className="text-sm text-muted-foreground">{occupation}</p>
                  </div>
                </div>
              )}

              {education && (
                <div className="flex items-center gap-4">
                  <GraduationCap className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Education</p>
                    <p className="text-sm text-muted-foreground">{education}</p>
                  </div>
                </div>
              )}
            </div>

            {interests && (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-base font-medium mb-2">Interests</p>
                  <div className="flex flex-wrap gap-2">
                    {interests.map((interest, index) => (
                      <Badge key={index} variant="secondary">
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      {(website || phone) && (
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {website && (
                <div className="flex items-center gap-4">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Website</p>
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {website}
                    </a>
                  </div>
                </div>
              )}

              {phone && (
                <div className="flex items-center gap-4">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Phone</p>
                    <p className="text-sm text-muted-foreground">{phone}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Identity & relationship details — server only returns these when the
          profile's identity/relationships visibility allows this viewer */}
      {(isOwnProfile || hasSensitive) && (
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Sensitive Information
                {!isOwnProfile && isAdmin && <Badge variant="destructive">Admin Access</Badge>}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {genderIdentity && (
                  <div>
                    <p className="text-sm font-medium">Gender Identity</p>
                    <p className="text-sm text-muted-foreground">{genderIdentity}</p>
                  </div>
                )}

                {sexualOrientation && (
                  <div>
                    <p className="text-sm font-medium">Sexual Orientation</p>
                    <p className="text-sm text-muted-foreground">{sexualOrientation}</p>
                  </div>
                )}

                {relationshipStatus && (
                  <div className="flex items-center gap-4">
                    <Heart className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Relationship Status</p>
                      <p className="text-sm text-muted-foreground">{relationshipStatus}</p>
                    </div>
                  </div>
                )}

              </div>

              {!isOwnProfile && isAdmin && (
                <div className="mt-4 p-4 bg-destructive/10 border border-destructive rounded-element">
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
