import { useState } from 'react';
import { MapPin, Loader2, Shield, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  venueName, 
  venueLatitude, 
  venueLongitude,
  onCheckInSuccess 
}: VenueCheckInButtonProps) {
  const { checkInAtVenue, loading, MAX_CHECKIN_DISTANCE_METERS } = useVenueCheckins();
  const { user } = useAuth();
  const [isPublic, setIsPublic] = useState(false);
  const [locationVisibility, setLocationVisibility] = useState<'private' | 'friends' | 'public'>('private');
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
      locationVisibility
    });
    if (result.success && onCheckInSuccess) {
      onCheckInSuccess();
      setShowPrivacyDialog(false);
    }
  };

  return (
    <Dialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
      <DialogTrigger asChild>
        <Button
          onClick={() => setShowPrivacyDialog(true)}
          disabled={loading}
          className="flex items-center gap-2"
          variant="default"
        >
          <Shield className="w-4 h-4" />
          Check In Securely
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Privacy-Protected Check-In
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="bg-accent/50 p-4 rounded-lg border">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Enhanced Privacy Protection</p>
                <p className="text-xs text-muted-foreground">
                  Your location is automatically anonymized after 24 hours. Choose your privacy settings below.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="public-check-in" className="text-sm font-medium">
                Make check-in visible to others
              </Label>
              <Switch
                id="public-check-in"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>

            {isPublic && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Location visibility</Label>
                <Select value={locationVisibility} onValueChange={(value: 'private' | 'friends' | 'public') => setLocationVisibility(value)}>
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
                    : 'Only you can see your exact location'
                  }
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => setShowPrivacyDialog(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCheckIn}
              disabled={loading}
              className="flex items-center gap-2 flex-1"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
              {loading ? 'Checking in...' : 'Check In'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}