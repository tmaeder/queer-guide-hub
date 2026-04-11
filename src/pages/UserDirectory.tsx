import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Search,
  MapPin,
  Calendar,
  Users,
  Filter,
  X,
  ChevronDown,
  Check,
  Heart,
  Briefcase,
  GraduationCap,
  Navigation,
  Loader2,
  ExternalLink,
  Sparkles,
  TrendingUp,
  Star,
} from 'lucide-react';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';
import { UserModeBadge } from '@/components/profile/UserModeBadge';
import { Tables } from '@/integrations/supabase/types';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

type Profile = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  pronouns?: string | null;
  age_range?: string | null;
  verified_identity?: boolean | null;
  user_mode?: string | null;
  is_business?: boolean | null;
  bio?: string | null;
  location?: string | null;
  occupation?: string | null;
  education?: string | null;
  created_at?: string | null;
  last_active_at?: string | null;
  relationship_status?: string | null;
  has_children?: boolean | null;
  has_pets?: boolean | null;
  gender_identity?: string | null;
  website?: string | null;
  interests?: string[] | null;
};

// Filter interface
interface UserFilters {
  searchQuery: string;
  location: string;
  ageRange: string;
  relationshipStatus: string;
  occupation: string;
  education: string;
  interests: string[];
  genderIdentity: string;
  isVerified: boolean;
  isBusiness: boolean;
  hasChildren: boolean;
  hasPets: boolean;
  sortBy: 'newest' | 'oldest' | 'alphabetical' | 'last_active';
}

const UserDirectory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<UserFilters>({
    searchQuery: '',
    location: '',
    ageRange: 'all',
    relationshipStatus: 'all',
    occupation: '',
    education: 'all',
    interests: [],
    genderIdentity: 'all',
    isVerified: false,
    isBusiness: false,
    hasChildren: false,
    hasPets: false,
    sortBy: 'newest',
  });

  const [showFilters, setShowFilters] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  // Filter options
  const ageRanges = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
  const relationshipStatuses = [
    'Single',
    'In a relationship',
    'Married',
    'Divorced',
    'Widowed',
    "It's complicated",
  ];
  const educationLevels = [
    'High School',
    'Some College',
    "Bachelor's",
    "Master's",
    'PhD',
    'Trade School',
  ];
  const genderIdentities = ['Man', 'Woman', 'Non-binary', 'Genderfluid', 'Agender', 'Other'];
  const commonInterests = [
    'Technology',
    'Art',
    'Music',
    'Sports',
    'Travel',
    'Food',
    'Books',
    'Movies',
    'Gaming',
    'Fitness',
    'Photography',
    'Nature',
    'Fashion',
    'Science',
  ];

  // Active filters count
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
          maximumAge: 300000, // 5 minutes
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

  const {
    data: profiles,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['user-directory', filters, nearMe, userLocation],
    enabled: !!user,
    queryFn: async () => {
      let query: any = supabase.from('profiles').select('*');

      // Search query
      if (filters.searchQuery) {
        query = query.or(
          `display_name.ilike.%${filters.searchQuery}%,bio.ilike.%${filters.searchQuery}%,location.ilike.%${filters.searchQuery}%`,
        );
      }

      // Location filter
      if (filters.location) {
        query = query.ilike('location', `%${filters.location}%`);
      }

      // Age range filter
      if (filters.ageRange && filters.ageRange !== 'all') {
        query = query.eq('age_range', filters.ageRange);
      }

      // Relationship status filter
      if (filters.relationshipStatus && filters.relationshipStatus !== 'all') {
        query = query.eq('relationship_status', filters.relationshipStatus);
      }

      // Occupation filter
      if (filters.occupation) {
        query = query.ilike('occupation', `%${filters.occupation}%`);
      }

      // Education filter
      if (filters.education && filters.education !== 'all') {
        query = query.eq('education', filters.education);
      }

      // Gender identity filter
      if (filters.genderIdentity && filters.genderIdentity !== 'all') {
        query = query.eq('gender_identity', filters.genderIdentity);
      }

      // Business filter
      if (filters.isBusiness) {
        query = query.eq('is_business', true);
      }

      // Children filter
      if (filters.hasChildren) {
        query = query.eq('has_children', true);
      }

      // Pets filter
      if (filters.hasPets) {
        query = query.eq('has_pets', true);
      }

      // Verified filter
      if (filters.isVerified) {
        query = query.eq('verified_identity', true);
      }

      // Sorting
      switch (filters.sortBy) {
        case 'oldest':
          query = query.order('created_at', { ascending: true });
          break;
        case 'alphabetical':
          query = query.order('display_name', { ascending: true });
          break;
        case 'last_active':
          query = query.order('last_active_at', { ascending: false });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Profile fetch error:', error);
        throw new Error(`Failed to load profiles: ${error.message}`);
      }

      // Filter by interests (client-side since it's a JSON array)
      let filteredData = data as Profile[];
      if (filters.interests.length > 0) {
        filteredData = filteredData.filter((profile) => {
          const profileInterests = (profile.interests as string[]) || [];
          return filters.interests.some((interest) =>
            profileInterests.some((profileInterest) =>
              profileInterest.toLowerCase().includes(interest.toLowerCase()),
            ),
          );
        });
      }

      // Apply Near Me filtering if enabled
      if (nearMe && userLocation) {
        // For now, we'll use a simple approach since we don't have lat/lng for users
        // In a real app, you'd want to geocode the user locations or store coordinates
        try {
          // Get user's current city using reverse geocoding
          const response = await fetch('/functions/v1/mapbox-geocoding', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `${userLocation.longitude},${userLocation.latitude}`,
              isReverseGeocode: true,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.features && data.features.length > 0) {
              const userCity = data.features[0].place_name;
              const cityParts = userCity.split(',').map((part) => part.trim().toLowerCase());

              // Filter users whose location contains any part of the user's city
              filteredData = filteredData.filter((profile) => {
                if (!profile.location) return false;
                const profileLocation = profile.location.toLowerCase();
                return cityParts.some(
                  (cityPart) => profileLocation.includes(cityPart) && cityPart.length > 2,
                );
              });
            }
          }
        } catch (error) {
          console.error('Error getting user city for near me filter:', error);
          // If geocoding fails, fall back to showing all users
        }
      }

      return filteredData;
    },
    retry: 2,
    retryDelay: 1000,
    staleTime: 30000, // Cache for 30 seconds
  });

  const clearAllFilters = () => {
    setFilters({
      searchQuery: '',
      location: '',
      ageRange: 'all',
      relationshipStatus: 'all',
      occupation: '',
      education: 'all',
      interests: [],
      genderIdentity: 'all',
      isVerified: false,
      isBusiness: false,
      hasChildren: false,
      hasPets: false,
      sortBy: 'newest',
    });
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
    <Container maxWidth="lg" sx={{ py: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Hero Section */}
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

      {/* Privacy notice for logged-out users */}
      {!user && (
        <Card sx={{ mb: 4, bgcolor: 'action.hover' }}>
          <CardContent sx={{ p: 3, textAlign: 'center' }}>
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

      {/* Search and Filter Section */}
      <Paper variant="outlined" sx={{ bgcolor: 'background.paper' }}>
        <CardContent style={{ padding: 20 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
              <Box sx={{ position: 'relative', flex: 1 }}>
                <Search
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: 16,
                    width: 16,
                    color: 'hsl(var(--muted-foreground))',
                  }}
                />
                <Input
                  placeholder="Search by name, bio, location, or interests..."
                  value={filters.searchQuery}
                  onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
                  style={{
                    paddingLeft: 40,
                    height: 48,
                    fontSize: '1rem',
                    border: '2px solid',
                    transition: 'border-color 0.2s',
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant={nearMe ? 'default' : 'outline'}
                  onClick={handleNearMeToggle}
                  disabled={isDetectingLocation}
                  size="icon"
                  style={
                    nearMe
                      ? { backgroundColor: '#333333', color: '#ffffff', height: 48, width: 48 }
                      : { height: 48, width: 48 }
                  }
                >
                  {isDetectingLocation ? (
                    <Loader2
                      style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }}
                    />
                  ) : (
                    <Navigation style={{ height: 16, width: 16 }} />
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  size="icon"
                  style={{
                    position: 'relative',
                    height: 48,
                    width: 48,
                    transition: 'background-color 0.2s',
                  }}
                >
                  <Filter style={{ height: 16, width: 16 }} />
                  {activeFiltersCount > 0 && (
                    <Badge
                      variant="secondary"
                      style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        height: 20,
                        width: 20,
                        padding: 0,
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#333333',
                        color: '#ffffff',
                      }}
                    >
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </Box>
            </Box>

            {/* Advanced Filters */}
            {showFilters && user && (
              <Box>
                <Card style={{}}>
                  <CardContent style={{ padding: 24 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Star style={{ height: 20, width: 20 }} />
                          <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
                            Advanced Filters
                          </Typography>
                        </Box>
                        {activeFiltersCount > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAllFilters}
                            style={{ gap: 8 }}
                          >
                            <X style={{ height: 16, width: 16 }} />
                            Clear All ({activeFiltersCount})
                          </Button>
                        )}
                      </Box>

                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' },
                          gap: 3,
                        }}
                      >
                        {/* Location Filter */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          <Label
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <MapPin style={{ height: 16, width: 16 }} />
                            Location
                          </Label>
                          <Input
                            placeholder="Enter city or region"
                            value={filters.location}
                            onChange={(e) =>
                              setFilters((prev) => ({ ...prev, location: e.target.value }))
                            }
                            style={{}}
                          />
                        </Box>

                        {/* Age Range Filter */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          <Label
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <Calendar style={{ height: 16, width: 16 }} />
                            Age Range
                          </Label>
                          <Select
                            value={filters.ageRange}
                            onValueChange={(value) =>
                              setFilters((prev) => ({ ...prev, ageRange: value }))
                            }
                          >
                            <SelectTrigger style={{}}>
                              <SelectValue placeholder="Select age range" />
                            </SelectTrigger>
                            <SelectContent style={{}}>
                              <SelectItem value="all">All ages</SelectItem>
                              {ageRanges.map((range) => (
                                <SelectItem key={range} value={range}>
                                  {range}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Box>

                        {/* Relationship Status */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          <Label
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <Heart style={{ height: 16, width: 16 }} />
                            Relationship Status
                          </Label>
                          <Select
                            value={filters.relationshipStatus}
                            onValueChange={(value) =>
                              setFilters((prev) => ({ ...prev, relationshipStatus: value }))
                            }
                          >
                            <SelectTrigger style={{}}>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent style={{}}>
                              <SelectItem value="all">Any status</SelectItem>
                              {relationshipStatuses.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Box>

                        {/* Occupation */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          <Label
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <Briefcase style={{ height: 16, width: 16 }} />
                            Occupation
                          </Label>
                          <Input
                            placeholder="Enter occupation"
                            value={filters.occupation}
                            onChange={(e) =>
                              setFilters((prev) => ({ ...prev, occupation: e.target.value }))
                            }
                            style={{}}
                          />
                        </Box>

                        {/* Education */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          <Label
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <GraduationCap style={{ height: 16, width: 16 }} />
                            Education
                          </Label>
                          <Select
                            value={filters.education}
                            onValueChange={(value) =>
                              setFilters((prev) => ({ ...prev, education: value }))
                            }
                          >
                            <SelectTrigger style={{}}>
                              <SelectValue placeholder="Select education" />
                            </SelectTrigger>
                            <SelectContent style={{}}>
                              <SelectItem value="all">Any education</SelectItem>
                              {educationLevels.map((level) => (
                                <SelectItem key={level} value={level}>
                                  {level}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Box>

                        {/* Gender Identity */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          <Label
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <Users style={{ height: 16, width: 16 }} />
                            Gender Identity
                          </Label>
                          <Select
                            value={filters.genderIdentity}
                            onValueChange={(value) =>
                              setFilters((prev) => ({ ...prev, genderIdentity: value }))
                            }
                          >
                            <SelectTrigger style={{}}>
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                            <SelectContent style={{}}>
                              <SelectItem value="all">Any gender</SelectItem>
                              {genderIdentities.map((gender) => (
                                <SelectItem key={gender} value={gender}>
                                  {gender}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Box>
                      </Box>

                      {/* Interests Filter */}
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Label
                          style={{
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <Sparkles style={{ height: 16, width: 16 }} />
                          Interests
                        </Label>
                        <Popover open={interestsOpen} onOpenChange={setInterestsOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={interestsOpen}
                              style={{
                                width: '100%',
                                justifyContent: 'space-between',
                                border: '2px solid',
                              }}
                            >
                              {filters.interests.length > 0
                                ? `${filters.interests.length} interest${filters.interests.length !== 1 ? 's' : ''} selected`
                                : 'Select interests...'}
                              <ChevronDown
                                style={{
                                  marginLeft: 8,
                                  height: 16,
                                  width: 16,
                                  flexShrink: 0,
                                  color: 'hsl(var(--muted-foreground))',
                                }}
                              />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            style={{ width: '100%', padding: 0, border: '2px solid' }}
                          >
                            <Command>
                              <CommandInput placeholder="Search interests..." />
                              <CommandList>
                                <CommandEmpty>No interests found.</CommandEmpty>
                                <CommandGroup>
                                  {commonInterests.map((interest) => (
                                    <CommandItem
                                      key={interest}
                                      value={interest}
                                      onSelect={() => handleInterestToggle(interest)}
                                    >
                                      <Check
                                        style={{
                                          marginRight: 8,
                                          height: 16,
                                          width: 16,
                                          visibility: filters.interests.includes(interest)
                                            ? 'visible'
                                            : 'hidden',
                                        }}
                                      />
                                      {interest}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {filters.interests.length > 0 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                            {filters.interests.map((interest) => (
                              <Badge key={interest} variant="secondary" style={{ gap: 4 }}>
                                <Sparkles style={{ height: 12, width: 12 }} />
                                {interest}
                                <X
                                  style={{ height: 12, width: 12, cursor: 'pointer' }}
                                  onClick={() => handleInterestToggle(interest)}
                                />
                              </Badge>
                            ))}
                          </Box>
                        )}
                      </Box>

                      {/* Boolean Filters */}
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' },
                          gap: 2,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox
                            id="verified"
                            checked={filters.isVerified}
                            onCheckedChange={(checked) =>
                              setFilters((prev) => ({ ...prev, isVerified: !!checked }))
                            }
                          />
                          <Label htmlFor="verified" style={{ fontSize: '0.875rem' }}>
                            Verified profiles
                          </Label>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox
                            id="business"
                            checked={filters.isBusiness}
                            onCheckedChange={(checked) =>
                              setFilters((prev) => ({ ...prev, isBusiness: !!checked }))
                            }
                          />
                          <Label htmlFor="business" style={{ fontSize: '0.875rem' }}>
                            Business accounts
                          </Label>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox
                            id="children"
                            checked={filters.hasChildren}
                            onCheckedChange={(checked) =>
                              setFilters((prev) => ({ ...prev, hasChildren: !!checked }))
                            }
                          />
                          <Label htmlFor="children" style={{ fontSize: '0.875rem' }}>
                            Has children
                          </Label>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox
                            id="pets"
                            checked={filters.hasPets}
                            onCheckedChange={(checked) =>
                              setFilters((prev) => ({ ...prev, hasPets: !!checked }))
                            }
                          />
                          <Label htmlFor="pets" style={{ fontSize: '0.875rem' }}>
                            Has pets
                          </Label>
                        </Box>
                      </Box>

                      {/* Sort Options */}
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Label
                          style={{
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <TrendingUp style={{ height: 16, width: 16 }} />
                          Sort By
                        </Label>
                        <Select
                          value={filters.sortBy}
                          onValueChange={(value) =>
                            setFilters((prev) => ({ ...prev, sortBy: value as any }))
                          }
                        >
                          <SelectTrigger style={{ width: 200, border: '2px solid' }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent style={{}}>
                            <SelectItem value="newest">Newest members</SelectItem>
                            <SelectItem value="oldest">Oldest members</SelectItem>
                            <SelectItem value="alphabetical">Alphabetical</SelectItem>
                            <SelectItem value="last_active">Last active</SelectItem>
                          </SelectContent>
                        </Select>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* Active Filters Display */}
            {activeFiltersCount > 0 && !showFilters && (
              <Box>
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 2,
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'text.secondary',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Filter style={{ height: 16, width: 16 }} />
                    Active filters:
                  </Typography>
                  {nearMe && (
                    <Badge
                      variant="secondary"
                      style={{
                        gap: 4,
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        borderColor: '#bfdbfe',
                      }}
                    >
                      <Navigation style={{ height: 12, width: 12 }} />
                      Near Me
                      <X
                        style={{ height: 12, width: 12, cursor: 'pointer' }}
                        onClick={handleNearMeToggle}
                      />
                    </Badge>
                  )}
                  {filters.location && (
                    <Badge variant="secondary" style={{ gap: 4 }}>
                      <MapPin style={{ height: 12, width: 12 }} />
                      {filters.location}
                      <X
                        style={{ height: 12, width: 12, cursor: 'pointer' }}
                        onClick={() => setFilters((prev) => ({ ...prev, location: '' }))}
                      />
                    </Badge>
                  )}
                  {filters.ageRange && filters.ageRange !== 'all' && (
                    <Badge variant="secondary" style={{ gap: 4 }}>
                      <Calendar style={{ height: 12, width: 12 }} />
                      {filters.ageRange}
                      <X
                        style={{ height: 12, width: 12, cursor: 'pointer' }}
                        onClick={() => setFilters((prev) => ({ ...prev, ageRange: 'all' }))}
                      />
                    </Badge>
                  )}
                  {filters.interests.map((interest) => (
                    <Badge key={interest} variant="secondary" style={{ gap: 4 }}>
                      <Sparkles style={{ height: 12, width: 12 }} />
                      {interest}
                      <X
                        style={{ height: 12, width: 12, cursor: 'pointer' }}
                        onClick={() => handleInterestToggle(interest)}
                      />
                    </Badge>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </CardContent>
      </Paper>

      {/* Loading State */}
      {isLoading ? (
        <PageLoadingState count={6} />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Results Header */}
          {profiles && profiles.length > 0 && (
            <Paper
              variant="outlined"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 2,
                bgcolor: 'action.hover',
                borderRadius: 2,
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Users style={{ height: 20, width: 20 }} />
                <Typography component="span" sx={{ fontWeight: 500 }}>
                  {profiles.length} member{profiles.length !== 1 ? 's' : ''} found
                </Typography>
                {activeFiltersCount > 0 && (
                  <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                    Filtered
                  </Badge>
                )}
              </Box>
              <Select
                value={filters.sortBy}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, sortBy: value as any }))}
              >
                <SelectTrigger style={{ width: 'auto', border: 0 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest members</SelectItem>
                  <SelectItem value="oldest">Oldest members</SelectItem>
                  <SelectItem value="alphabetical">Alphabetical</SelectItem>
                  <SelectItem value="last_active">Last active</SelectItem>
                </SelectContent>
              </Select>
            </Paper>
          )}

          {/* User Grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' },
              gap: 3,
            }}
          >
            {profiles?.map((profile) => (
              <Link
                key={profile.user_id}
                to={`/user/${profile.user_id}`}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <Card
                  style={{
                    height: '100%',
                    transition: 'all 0.3s',
                    border: '2px solid',
                    padding: 24,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                    <Box sx={{ position: 'relative' }}>
                      <Avatar style={{ height: 64, width: 64 }}>
                        <AvatarImage src={profile.avatar_url || undefined} />
                        <AvatarFallback
                          style={{
                            backgroundColor: '#333333',
                            color: '#ffffff',
                            fontSize: '1.125rem',
                            fontWeight: 700,
                          }}
                        >
                          {profile.display_name?.charAt(0)?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      {profile.verified_identity && (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: 3,
                            bgcolor: '#333333',
                            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                          }}
                        >
                          <Check style={{ height: 12, width: 12, color: '#ffffff' }} />
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 700,
                          fontSize: '1.125rem',
                          color: 'text.primary',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {profile.display_name || 'Anonymous User'}
                      </Typography>
                      {user && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            fontSize: '0.875rem',
                            color: 'text.secondary',
                            mb: 1,
                          }}
                        >
                          {profile.pronouns && (
                            <Typography
                              component="span"
                              sx={{ fontWeight: 500, fontSize: 'inherit', color: 'inherit' }}
                            >
                              {profile.pronouns}
                            </Typography>
                          )}
                          {profile.age_range && (
                            <>
                              {profile.pronouns && (
                                <Typography
                                  component="span"
                                  sx={{ fontSize: 'inherit', color: 'inherit' }}
                                >
                                  &#8226;
                                </Typography>
                              )}
                              <Typography
                                component="span"
                                sx={{ fontSize: 'inherit', color: 'inherit' }}
                              >
                                {profile.age_range}
                              </Typography>
                            </>
                          )}
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(profile as any)?.user_mode && (
                          <UserModeBadge mode={(profile as any).user_mode} size="sm" />
                        )}
                        {profile.is_business && (
                          <Badge
                            variant="outline"
                            style={{
                              fontSize: '0.75rem',
                              backgroundColor: '#eff6ff',
                              borderColor: '#bfdbfe',
                              color: '#1d4ed8',
                            }}
                          >
                            <Briefcase style={{ height: 12, width: 12, marginRight: 4 }} />
                            Business
                          </Badge>
                        )}
                        {profile.verified_identity && (
                          <Badge
                            variant="outline"
                            style={{
                              fontSize: '0.75rem',
                              backgroundColor: '#f0fdf4',
                              borderColor: '#bbf7d0',
                              color: '#15803d',
                            }}
                          >
                            <Check style={{ height: 12, width: 12, marginRight: 4 }} />
                            Verified
                          </Badge>
                        )}
                      </Box>
                    </Box>
                  </Box>

                  {user && profile.bio && (
                    <Typography
                      sx={{
                        fontSize: '0.875rem',
                        color: 'text.secondary',
                        mb: 2,
                        lineHeight: 1.75,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {profile.bio}
                    </Typography>
                  )}

                  {user && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                      {profile.location && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.875rem',
                            color: 'text.secondary',
                          }}
                        >
                          <MapPin style={{ height: 16, width: 16, marginRight: 8 }} />
                          {profile.location}
                        </Box>
                      )}

                      {profile.occupation && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.875rem',
                            color: 'text.secondary',
                          }}
                        >
                          <Briefcase style={{ height: 16, width: 16, marginRight: 8 }} />
                          {profile.occupation}
                        </Box>
                      )}

                      {profile.education && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.875rem',
                            color: 'text.secondary',
                          }}
                        >
                          <GraduationCap style={{ height: 16, width: 16, marginRight: 8 }} />
                          {profile.education}
                        </Box>
                      )}

                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '0.875rem',
                          color: 'text.secondary',
                        }}
                      >
                        <Calendar style={{ height: 16, width: 16, marginRight: 8 }} />
                        Joined {new Date(profile.created_at).toLocaleDateString()}
                      </Box>
                    </Box>
                  )}

                  {/* Profile Tags */}
                  {user && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                      {profile.relationship_status && (
                        <Badge
                          variant="outline"
                          style={{
                            fontSize: '0.75rem',
                            backgroundColor: '#fdf2f8',
                            borderColor: '#fbcfe8',
                            color: '#be185d',
                          }}
                        >
                          <Heart style={{ height: 12, width: 12, marginRight: 4 }} />
                          {profile.relationship_status}
                        </Badge>
                      )}
                      {profile.has_children && (
                        <Badge
                          variant="outline"
                          style={{
                            fontSize: '0.75rem',
                            backgroundColor: '#fff7ed',
                            borderColor: '#fed7aa',
                            color: '#c2410c',
                          }}
                        >
                          Children
                        </Badge>
                      )}
                      {profile.has_pets && (
                        <Badge
                          variant="outline"
                          style={{
                            fontSize: '0.75rem',
                            backgroundColor: '#fffbeb',
                            borderColor: '#fde68a',
                            color: '#b45309',
                          }}
                        >
                          Pets
                        </Badge>
                      )}
                      {profile.gender_identity && (
                        <Badge
                          variant="secondary"
                          style={{ fontSize: '0.75rem', borderColor: '#e9d5ff' }}
                        >
                          {profile.gender_identity}
                        </Badge>
                      )}
                    </Box>
                  )}

                  {/* Action Footer */}
                  <Box
                    sx={{
                      mt: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      pt: 2,
                      borderTop: 1,
                      borderColor: 'divider',
                    }}
                  >
                    {profile.website ? (
                      <Box
                        component="a"
                        href={profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          fontSize: '0.875rem',
                          color: 'primary.main',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          fontWeight: 500,
                          '&:hover': { textDecoration: 'underline' },
                        }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        Visit Website
                        <ExternalLink style={{ height: 12, width: 12 }} />
                      </Box>
                    ) : (
                      <Box />
                    )}

                    <Box onClick={(e) => e.stopPropagation()}>
                      <StartConversationButton
                        userId={profile.user_id}
                        userName={profile.display_name || 'Anonymous User'}
                        variant="outline"
                        size="sm"
                        style={{ transition: 'all 0.2s' }}
                      />
                    </Box>
                  </Box>
                </Card>
              </Link>
            ))}
          </Box>
        </Box>
      )}

      {/* Empty State */}
      {profiles && profiles.length === 0 && (
        <Card style={{}}>
          <CardContent
            style={{
              padding: 48,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            }}
          >
            <Box sx={{ position: 'relative', display: 'inline-block', mx: 'auto' }}>
              <Users style={{ height: 64, width: 64 }} />
              <Box
                sx={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  width: 32,
                  height: 32,
                  bgcolor: 'action.hover',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Search style={{ height: 16, width: 16 }} />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography
                variant="h6"
                sx={{ fontSize: '1.25rem', fontWeight: 600, color: 'text.primary' }}
              >
                No members found
              </Typography>
              <Typography sx={{ color: 'text.secondary', maxWidth: '28rem', mx: 'auto' }}>
                {filters.searchQuery || activeFiltersCount > 0
                  ? 'Try adjusting your search terms or filters to discover more amazing people in our community.'
                  : 'Be among the first to join our growing community of inclusive and welcoming members!'}
              </Typography>
            </Box>
            {(filters.searchQuery || activeFiltersCount > 0) && (
              <Button variant="outline" onClick={clearAllFilters} style={{ gap: 8 }}>
                <X style={{ height: 16, width: 16 }} />
                Clear all filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </Container>
  );
};

export default UserDirectory;
