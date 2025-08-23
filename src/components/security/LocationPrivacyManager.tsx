import React from 'react';
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location Privacy Settings
          </CardTitle>
          <CardDescription>
            Control how your location data is shared and protected
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Precise Location Setting */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Precise Location Sharing</div>
                <div className="text-sm text-muted-foreground">
                  Allow others to see your exact location coordinates
                </div>
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
            <div className="flex items-center space-x-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Region-Only Sharing</div>
                <div className="text-sm text-muted-foreground">
                  Show only city/region instead of exact venues
                </div>
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
            <div className="flex items-center space-x-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Automatic Data Anonymization</div>
                <div className="text-sm text-muted-foreground">
                  Automatically anonymize location data after {locationSettings.anonymizationDays} days
                </div>
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
        </CardContent>
      </Card>

      {/* Privacy Information */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Privacy Protection:</strong> Your location data is automatically anonymized after {locationSettings.anonymizationDays} days. 
          Even when sharing is enabled, precise coordinates are reduced to approximate regions for older data.
        </AlertDescription>
      </Alert>

      {/* Manual Anonymization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="h-5 w-5" />
            Data Protection Actions
          </CardTitle>
          <CardDescription>
            Manually trigger privacy protection measures
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Anonymize All Location Data</h4>
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
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold mb-2">
                {locationSettings.preciseLocation ? "Visible" : "Hidden"}
              </div>
              <div className="text-sm text-muted-foreground">Precise Location</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold mb-2">
                {locationSettings.anonymizationDays}d
              </div>
              <div className="text-sm text-muted-foreground">Auto-Anonymize After</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold mb-2">
                {locationSettings.autoAnonymize ? "On" : "Off"}
              </div>
              <div className="text-sm text-muted-foreground">Auto-Protection</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}