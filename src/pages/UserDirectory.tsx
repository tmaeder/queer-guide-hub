import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Sparkles } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useAuth } from '@/hooks/useAuth';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useTranslation } from 'react-i18next';
import {
  useUserDirectoryQuery,
  defaultUserFilters,
  UserFilters,
} from '@/hooks/useUserDirectoryQuery';
import { UserDirectoryFilters } from '@/components/user-directory/UserDirectoryFilters';
import { UserDirectoryGrid } from '@/components/user-directory/UserDirectoryGrid';

const UserDirectory = () => {
  const { _t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const [filters, setFilters] = useState<UserFilters>(defaultUserFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.location) count++;
    if (filters.ageRange && filters.ageRange !== 'all') count++;
    if (filters.relationshipStatus && filters.relationshipStatus !== 'all') count++;
    if (filters.occupation) count++;
    if (filters.education && filters.education !== 'all') count++;
    if (filters.interests.length > 0) count++;
    if (filters.genderIdentity && filters.genderIdentity !== 'all') count++;
    if (filters.isVerified) count++;
    if (filters.isBusiness) count++;
    if (filters.hasChildren) count++;
    if (filters.hasPets) count++;
    if (nearMe) count++;
    return count;
  }, [filters, nearMe]);

  const detectLocation = async () => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser');
      return;
    }

    setIsDetectingLocation(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        });
      });

      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });
      setNearMe(true);
    } catch (error) {
      console.error('Error detecting location:', error);
      setNearMe(false);
      setUserLocation(null);
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleNearMeToggle = () => {
    if (nearMe) {
      setNearMe(false);
      setUserLocation(null);
    } else {
      detectLocation();
    }
  };

  const { data: profiles, isLoading } = useUserDirectoryQuery({
    filters,
    nearMe,
    userLocation,
    enabled: !!user,
  });

  const clearAllFilters = () => {
    setFilters(defaultUserFilters);
    setNearMe(false);
    setUserLocation(null);
  };

  const handleInterestToggle = (interest: string) => {
    setFilters((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  return (
    <Container sx={{ py: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 3, md: 4 },
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Typography
          variant="h3"
          sx={{ fontWeight: 700, color: 'text.primary', fontSize: { xs: '2rem', md: '2.5rem' } }}
        >
          Members
        </Typography>
        <Typography
          sx={{
            fontSize: '1.05rem',
            color: 'text.secondary',
            maxWidth: '40rem',
            mx: 'auto',
            lineHeight: 1.6,
          }}
        >
          Discover amazing people, build meaningful connections, and grow your network within our
          inclusive LGBTQ+ community.
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 1.5,
            fontSize: '0.875rem',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.75,
              bgcolor: 'action.hover',
              borderRadius: '9999px',
            }}
          >
            <Users style={{ height: 14, width: 14 }} />
            <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
              {profiles?.length || 0} Members
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.75,
              bgcolor: 'action.hover',
              borderRadius: '9999px',
            }}
          >
            <Sparkles style={{ height: 14, width: 14, color: '#2563eb' }} />
            <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
              Active Community
            </Typography>
          </Box>
        </Box>
      </Paper>

      {!user && (
        <Card>
          <CardContent>
            <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
              Community Directory
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Member profiles are visible to signed-in members to protect privacy. Sign in to browse
              the full directory, see detailed profiles, and connect.
            </Typography>
            <Button onClick={() => navigate('/auth')} style={{ paddingLeft: 24, paddingRight: 24 }}>
              Sign In to Browse
            </Button>
          </CardContent>
        </Card>
      )}

      <UserDirectoryFilters
        filters={filters}
        setFilters={setFilters}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        interestsOpen={interestsOpen}
        setInterestsOpen={setInterestsOpen}
        nearMe={nearMe}
        isDetectingLocation={isDetectingLocation}
        handleNearMeToggle={handleNearMeToggle}
        activeFiltersCount={activeFiltersCount}
        clearAllFilters={clearAllFilters}
        handleInterestToggle={handleInterestToggle}
        isAuthed={!!user}
      />

      {isLoading ? (
        <PageLoadingState count={6} />
      ) : (
        <UserDirectoryGrid
          profiles={profiles}
          filters={filters}
          setFilters={setFilters}
          activeFiltersCount={activeFiltersCount}
          isAuthed={!!user}
          clearAllFilters={clearAllFilters}
        />
      )}
    </Container>
  );
};

export default UserDirectory;
