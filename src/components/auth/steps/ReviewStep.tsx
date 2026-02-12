import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Mail, MapPin, Heart, Settings } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SignupData } from '../MultiStepSignup';

interface ReviewStepProps {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

export default function ReviewStep({ data }: ReviewStepProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>Review your information</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Make sure everything looks good before creating your account
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Card>
          <CardHeader sx={{ pb: 1.5 }}>
            <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem' }}>
              <User style={{ height: 16, width: 16 }} />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box>
              <Box component="span" sx={{ fontWeight: 500 }}>Display Name:</Box> {data.displayName || 'Not set'}
            </Box>
            <Box>
              <Box component="span" sx={{ fontWeight: 500 }}>Name:</Box> {data.firstName} {data.lastName}
            </Box>
            {data.dateOfBirth && (
              <Box>
                <Box component="span" sx={{ fontWeight: 500 }}>Date of Birth:</Box> {data.dateOfBirth}
              </Box>
            )}
            {data.location && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MapPin style={{ height: 16, width: 16 }} />
                <Box component="span">{data.location}</Box>
              </Box>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ pb: 1.5 }}>
            <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem' }}>
              <Heart style={{ height: 16, width: 16 }} />
              Identity & Preferences
            </CardTitle>
          </CardHeader>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
              <Box component="span" sx={{ fontWeight: 500 }}>Pronouns:</Box> {data.pronouns || 'Not set'}
            </Box>
            <Box>
              <Box component="span" sx={{ fontWeight: 500 }}>Gender Identity:</Box> {data.genderIdentity || 'Not set'}
            </Box>
            {data.sexualOrientation && (
              <Box>
                <Box component="span" sx={{ fontWeight: 500 }}>Sexual Orientation:</Box> {data.sexualOrientation}
              </Box>
            )}
            {data.relationshipStatus && (
              <Box>
                <Box component="span" sx={{ fontWeight: 500 }}>Relationship Status:</Box> {data.relationshipStatus}
              </Box>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ pb: 1.5 }}>
            <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem' }}>
              <Heart style={{ height: 16, width: 16 }} />
              What You're Looking For
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.lookingFor && data.lookingFor.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {data.lookingFor.map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </Box>
            ) : (
              <Box component="span" sx={{ color: 'text.secondary' }}>Not specified</Box>
            )}
          </CardContent>
        </Card>

        {data.interests && data.interests.length > 0 && (
          <Card>
            <CardHeader sx={{ pb: 1.5 }}>
              <CardTitle sx={{ fontSize: '0.875rem' }}>Interests</CardTitle>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {data.interests.map((interest) => (
                  <Badge key={interest} variant="outline">
                    {interest}
                  </Badge>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader sx={{ pb: 1.5 }}>
            <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem' }}>
              <Mail style={{ height: 16, width: 16 }} />
              Account Settings
            </CardTitle>
          </CardHeader>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box>
              <Box component="span" sx={{ fontWeight: 500 }}>Email:</Box> {data.email}
            </Box>
            <Box>
              <Box component="span" sx={{ fontWeight: 500 }}>Profile Visibility:</Box> {data.profileVisibility}
            </Box>
            <Box>
              <Box component="span" sx={{ fontWeight: 500 }}>Email Notifications:</Box> {data.emailNotifications ? 'Enabled' : 'Disabled'}
            </Box>
            <Box>
              <Box component="span" sx={{ fontWeight: 500 }}>Match Notifications:</Box> {data.matchNotifications ? 'Enabled' : 'Disabled'}
            </Box>
          </CardContent>
        </Card>

        {data.bio && (
          <Card>
            <CardHeader sx={{ pb: 1.5 }}>
              <CardTitle sx={{ fontSize: '0.875rem' }}>Bio</CardTitle>
            </CardHeader>
            <CardContent>
              <Typography variant="body2">{data.bio}</Typography>
            </CardContent>
          </Card>
        )}
      </Box>

      <Separator />

      <Box sx={{ bgcolor: 'rgba(var(--primary), 0.05)', p: 2, borderRadius: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Ready to join The Queer Guide?</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Click "Create Account" to complete your registration. You'll receive an email to verify your account before you can sign in.
        </Typography>
      </Box>
    </Box>
  );
}
