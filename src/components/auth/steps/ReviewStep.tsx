import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Mail, MapPin, Heart, Settings } from 'lucide-react';
import type { SignupData } from '../MultiStepSignup';

interface ReviewStepProps {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

export default function ReviewStep({ data }: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Review your information</h3>
        <p className="text-sm text-muted-foreground">
          Make sure everything looks good before creating your account
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-medium">Display Name:</span> {data.displayName || 'Not set'}
            </div>
            <div>
              <span className="font-medium">Name:</span> {data.firstName} {data.lastName}
            </div>
            {data.dateOfBirth && (
              <div>
                <span className="font-medium">Date of Birth:</span> {data.dateOfBirth}
              </div>
            )}
            {data.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{data.location}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Heart className="h-4 w-4" />
              Identity & Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="font-medium">Pronouns:</span> {data.pronouns || 'Not set'}
            </div>
            <div>
              <span className="font-medium">Gender Identity:</span> {data.genderIdentity || 'Not set'}
            </div>
            {data.sexualOrientation && (
              <div>
                <span className="font-medium">Sexual Orientation:</span> {data.sexualOrientation}
              </div>
            )}
            {data.relationshipStatus && (
              <div>
                <span className="font-medium">Relationship Status:</span> {data.relationshipStatus}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Heart className="h-4 w-4" />
              What You're Looking For
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.lookingFor && data.lookingFor.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.lookingFor.map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">Not specified</span>
            )}
          </CardContent>
        </Card>

        {data.interests && data.interests.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Interests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.interests.map((interest) => (
                  <Badge key={interest} variant="outline">
                    {interest}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4" />
              Account Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-medium">Email:</span> {data.email}
            </div>
            <div>
              <span className="font-medium">Profile Visibility:</span> {data.profileVisibility}
            </div>
            <div>
              <span className="font-medium">Email Notifications:</span> {data.emailNotifications ? 'Enabled' : 'Disabled'}
            </div>
            <div>
              <span className="font-medium">Match Notifications:</span> {data.matchNotifications ? 'Enabled' : 'Disabled'}
            </div>
          </CardContent>
        </Card>

        {data.bio && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Bio</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{data.bio}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />

      <div className="bg-primary/5 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Ready to join The Queer Guide?</h4>
        <p className="text-sm text-muted-foreground">
          Click "Create Account" to complete your registration. You'll receive an email to verify your account before you can sign in.
        </p>
      </div>
    </div>
  );
}