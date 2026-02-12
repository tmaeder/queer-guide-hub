import { useState } from 'react';
import { MapPin, Loader2, Shield, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useVenueCheckins } from '@/hooks/useVenueCheckins';
import { useAuth } from '@/hooks/useAuth';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';

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
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          variant="default"
        >
          <Shield style={{ width: 16, height: 16 }} />
          Check In Securely
        </Button>
      </DialogTrigger>
      <DialogContent sx={{ maxWidth: { sm: '28rem' } }}>
        <DialogHeader>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield style={{ width: 20, height: 20 }} />
            Privacy-Protected Check-In
          </DialogTitle>
        </DialogHeader>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Paper sx={{ p: 2, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Shield style={{ width: 20, height: 20, marginTop: 2 }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Enhanced Privacy Protection</Typography>
                <Typography variant="caption" color="text.secondary">
                  Your location is automatically anonymized after 24 hours. Choose your privacy settings below.
                </Typography>
              </Box>
            </Box>
          </Paper>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Label htmlFor="public-check-in" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                Make check-in visible to others
              </Label>
              <Switch
                id="public-check-in"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </Box>

            {isPublic && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Location visibility</Label>
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
                <Typography variant="caption" color="text.secondary">
                  {locationVisibility === 'friends'
                    ? 'Friends see your location within ~100m accuracy'
                    : locationVisibility === 'public'
                    ? 'Public users see your location within ~1km accuracy'
                    : 'Only you can see your exact location'
                  }
                </Typography>
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
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
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
