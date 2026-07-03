import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
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
  const { t } = useTranslation();
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

  const { data: profiles, isLoading, isError, refetch } = useUserDirectoryQuery({
    filters,
    nearMe,
    userLocation,
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

  const memberCount = profiles?.length ?? 0;

  return (
    <div className="container mx-auto py-8 px-4 flex flex-col gap-8">
      <header className="border border-border rounded-container p-8 text-center flex flex-col gap-4 bg-background">
        <h1 className="text-display font-bold text-foreground">{t('pages.members.title', 'Members')}</h1>
        <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {t(
            'pages.members.subtitle',
            'People, connections, and networks within the inclusive LGBTQ+ community.',
          )}
        </p>
        {!isLoading && !isError && (
          <div className="flex flex-wrap justify-center gap-2 text-13">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-badge font-medium">
              <Users className="h-4 w-4" />
              {memberCount} {memberCount === 1 ? t('pages.members.member', 'member') : t('pages.members.members', 'members')}
              {!user && ` ${t('pages.members.visible', 'visible')}`}
            </span>
          </div>
        )}
      </header>

      {!user && (
        <Card>
          <CardContent className="pt-6 flex flex-col gap-4 text-center items-center">
            <p className="font-semibold text-foreground">
              {t('pages.members.upsellTitle', 'See the full community')}
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              {t(
                'pages.members.upsellBody',
                'Public profiles are listed here. Sign in to see bios, locations, interests, and to start a conversation.',
              )}
            </p>
            <Button onClick={() => navigate('/auth')} className="self-center">
              {t('pages.members.signInToBrowse', 'Sign in to browse')}
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
      ) : isError ? (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
            <p className="font-semibold text-foreground">Couldn't load members</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Something went wrong while fetching the directory. Try again in a moment.
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
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
