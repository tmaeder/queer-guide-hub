import { useState } from 'react';
import { MapPin, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useVenueCheckins } from '@/hooks/useVenueCheckins';
import { useAuth } from '@/hooks/useAuth';

interface VenueCheckInButtonProps {
  venueId: string;
  venueName: string;
  venueLatitude: number | null;
  venueLongitude: number | null;
  onCheckInSuccess?: () => void;
}

export function VenueCheckInButton({
  venueId,
  venueLatitude,
  venueLongitude,
  onCheckInSuccess,
}: VenueCheckInButtonProps) {
  const { checkInAtVenue, loading, _MAX_CHECKIN_DISTANCE_METERS } = useVenueCheckins();
  const { user } = useAuth();
  const [isPublic, setIsPublic] = useState(false);
  const [locationVisibility, setLocationVisibility] = useState<'private' | 'friends' | 'public'>(
    'private',
  );
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);

  if (!user) {
    return null; // Only show for authenticated users
  }

  if (!venueLatitude || !venueLongitude) {
    return null; // Only show if venue has coordinates
  }

  const handleCheckIn = async () => {
    const result = await checkInAtVenue(venueId, venueLatitude, venueLongitude, {
      isPublic,
      locationVisibility,
    });
    if (result.success && onCheckInSuccess) {
      onCheckInSuccess();
      setShowPrivacyDialog(false);
    }
  };

  return (
    <Dialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
      <DialogTrigger asChild>
        <Button onClick={() => setShowPrivacyDialog(true)} disabled={loading} variant="default">
          <Shield style={{ width: 16, height: 16 }} />
          Check In Securely
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Shield style={{ width: 20, height: 20 }} />
            Privacy-Protected Check-In
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          <div className="p-4 bg-accent border border-border rounded">
            <div className="flex items-start gap-3">
              <Shield style={{ width: 20, height: 20, marginTop: 2 }} />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  Enhanced Privacy Protection
                </p>
                <p className="text-xs text-muted-foreground">
                  Your location is automatically anonymized after 24 hours. Choose your privacy
                  settings below.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="public-check-in" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                Make check-in visible to others
              </Label>
              <Switch id="public-check-in" checked={isPublic} onCheckedChange={setIsPublic} />
            </div>

            {isPublic && (
              <div className="flex flex-col gap-2">
                <Label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Location visibility</Label>
                <Select
                  value={locationVisibility}
                  onValueChange={(value: 'private' | 'friends' | 'public') =>
                    setLocationVisibility(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private (Only you)</SelectItem>
                    <SelectItem value="friends">Friends only (Approximate)</SelectItem>
                    <SelectItem value="public">Public (Very approximate)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {locationVisibility === 'friends'
                    ? 'Friends see your location within ~100m accuracy'
                    : locationVisibility === 'public'
                      ? 'Public users see your location within ~1km accuracy'
                      : 'Only you can see your exact location'}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowPrivacyDialog(false)}
              style={{ flex: 1 }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCheckIn}
              disabled={loading}
              style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {loading ? (
                <Loader2 style={{ width: 16, height: 16 }} />
              ) : (
                <MapPin style={{ width: 16, height: 16 }} />
              )}
              {loading ? 'Checking in...' : 'Check In'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
