import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useLocationPrivacy } from '@/hooks/useLocationPrivacy';
import { MapPin, Shield, Clock, Eye, EyeOff } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function LocationPrivacyManager() {
  const {
    locationSettings,
    updateLocationSettings,
    triggerLocationAnonymization,
    loading
  } = useLocationPrivacy();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapPin style={{ height: 20, width: 20 }} />
              Location Privacy Settings
            </Box>
          </CardTitle>
          <CardDescription>
            Control how your location data is shared and protected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Precise Location Setting */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Eye style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>Precise Location Sharing</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Allow others to see your exact location coordinates
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge variant={locationSettings.preciseLocation ? "default" : "secondary"}>
                  {locationSettings.preciseLocation ? "Precise" : "Private"}
                </Badge>
                <Switch
                  checked={locationSettings.preciseLocation}
                  onCheckedChange={(checked) =>
                    updateLocationSettings({ preciseLocation: checked })
                  }
                  disabled={loading}
                />
              </Box>
            </Box>

            <Separator />

            {/* Region-Only Setting */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Shield style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>Region-Only Sharing</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Show only city/region instead of exact venues
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge variant={locationSettings.regionOnly ? "default" : "outline"}>
                  {locationSettings.regionOnly ? "Region Only" : "Full Details"}
                </Badge>
                <Switch
                  checked={locationSettings.regionOnly}
                  onCheckedChange={(checked) =>
                    updateLocationSettings({ regionOnly: checked })
                  }
                  disabled={loading}
                />
              </Box>
            </Box>

            <Separator />

            {/* Auto-Anonymize Setting */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Clock style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>Automatic Data Anonymization</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Automatically anonymize location data after {locationSettings.anonymizationDays} days
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge variant={locationSettings.autoAnonymize ? "default" : "destructive"}>
                  {locationSettings.autoAnonymize ? "Protected" : "Disabled"}
                </Badge>
                <Switch
                  checked={locationSettings.autoAnonymize}
                  onCheckedChange={(checked) =>
                    updateLocationSettings({ autoAnonymize: checked })
                  }
                  disabled={loading}
                />
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Privacy Information */}
      <Alert>
        <Shield style={{ height: 16, width: 16 }} />
        <AlertDescription>
          <strong>Privacy Protection:</strong> Your location data is automatically anonymized after {locationSettings.anonymizationDays} days.
          Even when sharing is enabled, precise coordinates are reduced to approximate regions for older data.
        </AlertDescription>
      </Alert>

      {/* Manual Anonymization */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EyeOff style={{ height: 20, width: 20 }} />
              Data Protection Actions
            </Box>
          </CardTitle>
          <CardDescription>
            Manually trigger privacy protection measures
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="subtitle2">Anonymize All Location Data</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Immediately anonymize all your stored location data for maximum privacy
                  </Typography>
                </Box>
                <Button
                  variant="outline"
                  onClick={triggerLocationAnonymization}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Anonymize Now"}
                </Button>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Current Settings Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Privacy Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            <Box sx={{ textAlign: 'center', p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
                {locationSettings.preciseLocation ? "Visible" : "Hidden"}
              </Typography>
              <Typography variant="body2" color="text.secondary">Precise Location</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
                {locationSettings.anonymizationDays}d
              </Typography>
              <Typography variant="body2" color="text.secondary">Auto-Anonymize After</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
                {locationSettings.autoAnonymize ? "On" : "Off"}
              </Typography>
              <Typography variant="body2" color="text.secondary">Auto-Protection</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
