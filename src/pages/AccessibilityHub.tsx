import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Accessibility, Heart, Shield, Users } from 'lucide-react';

export default function AccessibilityHub() {
  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Accessibility style={{ width: 48, height: 48 }} color="var(--mui-palette-primary-main)" />
        </Box>
        <Typography variant="h3" sx={{ fontWeight: 700 }}>Accessibility Hub</Typography>
        <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '42rem', mx: 'auto' }}>
          Customize your experience with accessibility features designed to make our platform
          more inclusive and easier to use for everyone.
        </Typography>
      </Box>

      {/* Commitment Card */}
      <Card sx={{ borderColor: 'primary.main', borderWidth: 1, borderStyle: 'solid', opacity: 0.8 }}>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Heart style={{ width: 20, height: 20 }} color="var(--mui-palette-primary-main)" />
              Our Accessibility Commitment
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography color="text.secondary">
              We believe technology should be accessible to everyone. Our platform is designed
              following WCAG 2.1 AA guidelines to ensure equal access for users with disabilities.
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge variant="secondary" sx={{ width: 'fit-content' }}>
                  <Accessibility style={{ width: 12, height: 12, marginRight: 4 }} />
                  WCAG 2.1 AA
                </Badge>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge variant="secondary" sx={{ width: 'fit-content' }}>
                  <Shield style={{ width: 12, height: 12, marginRight: 4 }} />
                  Screen Reader
                </Badge>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge variant="secondary" sx={{ width: 'fit-content' }}>
                  <Users style={{ width: 12, height: 12, marginRight: 4 }} />
                  Inclusive Design
                </Badge>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Separator />

      {/* Accessibility Controls */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>Accessibility Settings</Typography>
          <Typography color="text.secondary">
            Adjust these settings to customize your experience. Your preferences will be saved
            automatically and applied across the entire platform.
          </Typography>
        </Box>

        <AccessibilityControls />
      </Box>

      <Separator />

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Resources</CardTitle>
          <CardDescription>
            Learn more about accessibility and get support
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography sx={{ fontWeight: 500 }}>Need Help?</Typography>
              <Typography variant="body2" color="text.secondary">
                If you're experiencing accessibility issues or need assistance,
                please contact our support team at accessibility@queer.guide
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography sx={{ fontWeight: 500 }}>Feedback</Typography>
              <Typography variant="body2" color="text.secondary">
                We're constantly improving our accessibility features.
                Share your feedback to help us make the platform better for everyone.
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
