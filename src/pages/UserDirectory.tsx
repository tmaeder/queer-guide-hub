import { useState, useMemo } from 'react';
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
    <div className="container mx-auto py-8 px-4 flex flex-col gap-8">
      <div className="border border-border p-6 md:p-8 text-center flex flex-col gap-4 bg-background">
        <h3 className="text-3xl md:text-4xl font-bold text-foreground">Members</h3>
        <p className="text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          People, connections, and networks within the
          inclusive LGBTQ+ community.
        </p>
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full">
            <Users className="h-3.5 w-3.5" />
            <span className="text-sm font-medium">
              {profiles?.length || 0} Members
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-sm font-medium">Active Community</span>
          </div>
        </div>
      </div>

      {!user && (
        <Card>
          <CardContent>
            <p className="font-medium mb-2">Community Directory</p>
            <p className="text-sm text-muted-foreground mb-4">
              Member profiles are visible to signed-in members to protect privacy. Sign in to browse
              the full directory, see detailed profiles, and connect.
            </p>
            <Button onClick={() => navigate('/auth')} className="px-6">
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
    </div>
  );
};

export default UserDirectory;
