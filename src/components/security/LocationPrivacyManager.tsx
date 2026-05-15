import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useLocationPrivacy } from '@/hooks/useLocationPrivacy';
import { MapPin, Shield, Clock, Eye, EyeOff } from 'lucide-react';

export function LocationPrivacyManager() {
  const {
    locationSettings,
    updateLocationSettings,
    triggerLocationAnonymization,
    loading
  } = useLocationPrivacy();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <MapPin style={{ height: 20, width: 20 }} />
              Location Privacy Settings
            </div>
          </CardTitle>
          <CardDescription>
            Control how your location data is shared and protected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            {/* Precise Location Setting */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Eye style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <div>
                  <p className="font-medium">Precise Location Sharing</p>
                  <p className="text-sm text-muted-foreground">
                    Allow others to see your exact location coordinates
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
              </div>
            </div>

            <Separator />

            {/* Region-Only Setting */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <div>
                  <p className="font-medium">Region-Only Sharing</p>
                  <p className="text-sm text-muted-foreground">
                    Show only city/region instead of exact venues
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
              </div>
            </div>

            <Separator />

            {/* Auto-Anonymize Setting */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <div>
                  <p className="font-medium">Automatic Data Anonymization</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically anonymize location data after {locationSettings.anonymizationDays} days
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          </div>
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
            <div className="flex items-center gap-2">
              <EyeOff style={{ height: 20, width: 20 }} />
              Data Protection Actions
            </div>
          </CardTitle>
          <CardDescription>
            Manually trigger privacy protection measures
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="p-4 border border-border rounded-element">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Anonymize All Location Data</p>
                  <p className="text-sm text-muted-foreground">
                    Immediately anonymize all your stored location data for maximum privacy
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={triggerLocationAnonymization}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Anonymize Now"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Settings Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Privacy Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 border border-border rounded-element">
              <p className="text-xl font-bold mb-2">
                {locationSettings.preciseLocation ? "Visible" : "Hidden"}
              </p>
              <p className="text-sm text-muted-foreground">Precise Location</p>
            </div>
            <div className="text-center p-4 border border-border rounded-element">
              <p className="text-xl font-bold mb-2">
                {locationSettings.anonymizationDays}d
              </p>
              <p className="text-sm text-muted-foreground">Auto-Anonymize After</p>
            </div>
            <div className="text-center p-4 border border-border rounded-element">
              <p className="text-xl font-bold mb-2">
                {locationSettings.autoAnonymize ? "On" : "Off"}
              </p>
              <p className="text-sm text-muted-foreground">Auto-Protection</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
