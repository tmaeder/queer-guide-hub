import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Search, MapPin, Calendar, Users, Filter, X, ChevronDown, Check, Heart, Briefcase, GraduationCap, Navigation, Loader2, ExternalLink } from "lucide-react";
import { StartConversationButton } from "@/components/messaging/StartConversationButton";
import { UserModeBadge } from "@/components/profile/UserModeBadge";
import { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

type Profile = Tables<"profiles">;

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
  const [filters, setFilters] = useState<UserFilters>({
    searchQuery: "",
    location: "",
    ageRange: "all",
    relationshipStatus: "all",
    occupation: "",
    education: "all",
    interests: [],
    genderIdentity: "all",
    isVerified: false,
    isBusiness: false,
    hasChildren: false,
    hasPets: false,
    sortBy: 'newest'
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Filter options
  const ageRanges = ["18-25", "26-35", "36-45", "46-55", "56-65", "65+"];
  const relationshipStatuses = ["Single", "In a relationship", "Married", "Divorced", "Widowed", "It's complicated"];
  const educationLevels = ["High School", "Some College", "Bachelor's", "Master's", "PhD", "Trade School"];
  const genderIdentities = ["Man", "Woman", "Non-binary", "Genderfluid", "Agender", "Other"];
  const commonInterests = ["Technology", "Art", "Music", "Sports", "Travel", "Food", "Books", "Movies", "Gaming", "Fitness", "Photography", "Nature", "Fashion", "Science"];
  
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

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["user-directory", filters, nearMe, userLocation],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("*");

      // Search query
      if (filters.searchQuery) {
        query = query.or(`display_name.ilike.%${filters.searchQuery}%,bio.ilike.%${filters.searchQuery}%,location.ilike.%${filters.searchQuery}%`);
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
      if (error) throw error;
      
      // Filter by interests (client-side since it's a JSON array)
      let filteredData = data as Profile[];
      if (filters.interests.length > 0) {
        filteredData = filteredData.filter(profile => {
          const profileInterests = profile.interests as string[] || [];
          return filters.interests.some(interest => 
            profileInterests.some(profileInterest => 
              profileInterest.toLowerCase().includes(interest.toLowerCase())
            )
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
              isReverseGeocode: true
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.features && data.features.length > 0) {
              const userCity = data.features[0].place_name;
              const cityParts = userCity.split(',').map(part => part.trim().toLowerCase());
              
              // Filter users whose location contains any part of the user's city
              filteredData = filteredData.filter(profile => {
                if (!profile.location) return false;
                const profileLocation = profile.location.toLowerCase();
                return cityParts.some(cityPart => 
                  profileLocation.includes(cityPart) && cityPart.length > 2
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
  });

  const clearAllFilters = () => {
    setFilters({
      searchQuery: "",
      location: "",
      ageRange: "all",
      relationshipStatus: "all",
      occupation: "",
      education: "all",
      interests: [],
      genderIdentity: "all",
      isVerified: false,
      isBusiness: false,
      hasChildren: false,
      hasPets: false,
      sortBy: 'newest'
    });
    setNearMe(false);
    setUserLocation(null);
  };

  const handleInterestToggle = (interest: string) => {
    setFilters(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  return (
    <div className="w-full px-4 py-8">
      <div className="w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-4">User Directory</h1>
          <p className="text-lg text-muted-foreground mb-6">
            Discover and connect with community members
          </p>
          
          {/* Search and Filter Bar */}
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search users by name, bio, or location..."
                  value={filters.searchQuery}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                  className="pl-10"
                />
              </div>
              <Button
                variant={nearMe ? "default" : "outline"}
                onClick={handleNearMeToggle}
                disabled={isDetectingLocation}
                className="gap-2 whitespace-nowrap"
              >
                {isDetectingLocation ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4" />
                )}
                Near Me
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2 whitespace-nowrap"
              >
                <Filter className="h-4 w-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Advanced Filters */}
            {showFilters && (
              <Card className="p-6 bg-card border">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Advanced Filters</h3>
                    {activeFiltersCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-2">
                        <X className="h-4 w-4" />
                        Clear All
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Location Filter */}
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Input
                        placeholder="Enter city or region"
                        value={filters.location}
                        onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
                      />
                    </div>

                    {/* Age Range Filter */}
                    <div className="space-y-2">
                      <Label>Age Range</Label>
                      <Select value={filters.ageRange} onValueChange={(value) => setFilters(prev => ({ ...prev, ageRange: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select age range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All ages</SelectItem>
                          {ageRanges.map((range) => (
                            <SelectItem key={range} value={range}>{range}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Relationship Status */}
                    <div className="space-y-2">
                      <Label>Relationship Status</Label>
                      <Select value={filters.relationshipStatus} onValueChange={(value) => setFilters(prev => ({ ...prev, relationshipStatus: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Any status</SelectItem>
                          {relationshipStatuses.map((status) => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Occupation */}
                    <div className="space-y-2">
                      <Label>Occupation</Label>
                      <Input
                        placeholder="Enter occupation"
                        value={filters.occupation}
                        onChange={(e) => setFilters(prev => ({ ...prev, occupation: e.target.value }))}
                      />
                    </div>

                    {/* Education */}
                    <div className="space-y-2">
                      <Label>Education</Label>
                      <Select value={filters.education} onValueChange={(value) => setFilters(prev => ({ ...prev, education: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select education" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Any education</SelectItem>
                          {educationLevels.map((level) => (
                            <SelectItem key={level} value={level}>{level}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Gender Identity */}
                    <div className="space-y-2">
                      <Label>Gender Identity</Label>
                      <Select value={filters.genderIdentity} onValueChange={(value) => setFilters(prev => ({ ...prev, genderIdentity: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Any gender</SelectItem>
                          {genderIdentities.map((gender) => (
                            <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Interests Filter */}
                  <div className="space-y-2">
                    <Label>Interests</Label>
                    <Popover open={interestsOpen} onOpenChange={setInterestsOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={interestsOpen}
                          className="w-full justify-between"
                        >
                          {filters.interests.length > 0
                            ? `${filters.interests.length} interest${filters.interests.length !== 1 ? 's' : ''} selected`
                            : "Select interests..."}
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
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
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      filters.interests.includes(interest) ? "opacity-100" : "opacity-0"
                                    )}
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
                      <div className="flex flex-wrap gap-1 mt-2">
                        {filters.interests.map((interest) => (
                          <Badge key={interest} variant="secondary" className="gap-1">
                            {interest}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => handleInterestToggle(interest)}
                            />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Boolean Filters */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="verified"
                        checked={filters.isVerified}
                        onCheckedChange={(checked) => setFilters(prev => ({ ...prev, isVerified: !!checked }))}
                      />
                      <Label htmlFor="verified">Verified profiles</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="business"
                        checked={filters.isBusiness}
                        onCheckedChange={(checked) => setFilters(prev => ({ ...prev, isBusiness: !!checked }))}
                      />
                      <Label htmlFor="business">Business accounts</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="children"
                        checked={filters.hasChildren}
                        onCheckedChange={(checked) => setFilters(prev => ({ ...prev, hasChildren: !!checked }))}
                      />
                      <Label htmlFor="children">Has children</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="pets"
                        checked={filters.hasPets}
                        onCheckedChange={(checked) => setFilters(prev => ({ ...prev, hasPets: !!checked }))}
                      />
                      <Label htmlFor="pets">Has pets</Label>
                    </div>
                  </div>

                  {/* Sort Options */}
                  <div className="space-y-2">
                    <Label>Sort By</Label>
                    <Select value={filters.sortBy} onValueChange={(value) => setFilters(prev => ({ ...prev, sortBy: value as any }))}>
                      <SelectTrigger className="w-full md:w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Newest members</SelectItem>
                        <SelectItem value="oldest">Oldest members</SelectItem>
                        <SelectItem value="alphabetical">Alphabetical</SelectItem>
                        <SelectItem value="last_active">Last active</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            )}

            {/* Active Filters Display */}
            {activeFiltersCount > 0 && !showFilters && (
              <div className="flex flex-wrap gap-2 items-center justify-center">
                <span className="text-sm text-muted-foreground">Active filters:</span>
                {nearMe && (
                  <Badge variant="secondary" className="gap-1">
                    Near Me
                    <X className="h-3 w-3 cursor-pointer" onClick={handleNearMeToggle} />
                  </Badge>
                )}
                {filters.location && (
                  <Badge variant="secondary" className="gap-1">
                    Location: {filters.location}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, location: "" }))} />
                  </Badge>
                )}
                {filters.ageRange && filters.ageRange !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    Age: {filters.ageRange}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, ageRange: "all" }))} />
                  </Badge>
                )}
                {filters.interests.map((interest) => (
                  <Badge key={interest} variant="secondary" className="gap-1">
                    {interest}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => handleInterestToggle(interest)} />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="p-6 animate-pulse">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-12 h-12 bg-muted rounded-full" />
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-24" />
                    <div className="h-3 bg-muted rounded w-16" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {profiles?.map((profile) => (
              <Link key={profile.id} to={`/user/${profile.user_id}`} className="block">
                <Card className="p-6 hover:shadow-lg transition-all duration-200 hover-scale group cursor-pointer">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback>
                        {profile.display_name?.charAt(0)?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    {profile.verified_identity && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {profile.display_name || "Anonymous User"}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {profile.pronouns && <span>{profile.pronouns}</span>}
                      {profile.age_range && (
                        <>
                          {profile.pronouns && <span>•</span>}
                          <span>{profile.age_range}</span>
                        </>
                      )}
                    </div>
                  </div>
                   <div className="flex flex-col gap-1">
                    {(profile as any)?.user_mode && (
                      <UserModeBadge mode={(profile as any).user_mode} size="sm" />
                    )}
                    {profile.is_business && (
                      <Badge variant="outline" className="text-xs">
                        <Briefcase className="h-3 w-3 mr-1" />
                        Business
                      </Badge>
                    )}
                  </div>
                </div>

                {profile.bio && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {profile.bio}
                  </p>
                )}

                <div className="space-y-2 mb-4">
                  {profile.location && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mr-2" />
                      {profile.location}
                    </div>
                  )}
                  
                  {profile.occupation && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Briefcase className="h-4 w-4 mr-2" />
                      {profile.occupation}
                    </div>
                  )}

                  {profile.education && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <GraduationCap className="h-4 w-4 mr-2" />
                      {profile.education}
                    </div>
                  )}
                  
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 mr-2" />
                    Joined {new Date(profile.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Profile Tags */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {profile.relationship_status && (
                    <Badge variant="outline" className="text-xs">
                      <Heart className="h-3 w-3 mr-1" />
                      {profile.relationship_status}
                    </Badge>
                  )}
                  {profile.has_children && (
                    <Badge variant="outline" className="text-xs">Children</Badge>
                  )}
                  {profile.has_pets && (
                    <Badge variant="outline" className="text-xs">Pets</Badge>
                  )}
                  {profile.gender_identity && (
                    <Badge variant="secondary" className="text-xs">{profile.gender_identity}</Badge>
                  )}
                </div>

                
                <div className="mt-4 flex items-center justify-between">
                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Visit Website
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  
                  <div onClick={(e) => e.stopPropagation()}>
                    <StartConversationButton
                      userId={profile.user_id}
                      userName={profile.display_name || "Anonymous User"}
                      variant="outline"
                      size="sm"
                    />
                  </div>
                </div>
              </Card>
              </Link>
            ))}
          </div>
        )}

        {profiles && profiles.length === 0 && (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No users found</h3>
            <p className="text-muted-foreground">
              {filters.searchQuery || activeFiltersCount > 0
                ? "Try adjusting your search terms or filters" 
                : "Be the first to join the community!"
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDirectory;