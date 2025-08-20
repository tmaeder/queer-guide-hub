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
import { Search, MapPin, Calendar, Users, Filter, X, ChevronDown, Check, Heart, Briefcase, GraduationCap, Navigation, Loader2, ExternalLink, Sparkles, TrendingUp, Star } from "lucide-react";
import { StartConversationButton } from "@/components/messaging/StartConversationButton";
import { UserModeBadge } from "@/components/profile/UserModeBadge";
import { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import useScreenSize from "@/hooks/use-screen-size";
import Gravity, { MatterBody } from "@/fancy/components/physics/cursor-attractor-and-gravity";

type Profile = { user_id: string; display_name?: string | null; avatar_url?: string | null; pronouns?: string | null; age_range?: string | null; verified_identity?: boolean | null; user_mode?: string | null; is_business?: boolean | null; bio?: string | null; location?: string | null; occupation?: string | null; education?: string | null; created_at?: string | null; last_active_at?: string | null; relationship_status?: string | null; has_children?: boolean | null; has_pets?: boolean | null; gender_identity?: string | null; website?: string | null; interests?: string[] | null; };

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
  const screenSize = useScreenSize();
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
      let query: any = supabase
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
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Hero Section */}
        <Card>
          <CardContent className="p-8 text-center space-y-6">
            <div className="space-y-4">
              <div className="relative h-20">
                <Gravity
                  attractorPoint={{ x: "50%", y: "50%" }}
                  attractorStrength={0.0008}
                  cursorStrength={-0.006}
                  cursorFieldRadius={screenSize.lessThan("sm") ? 100 : 200}
                  className="w-full h-full"
                >
                  <MatterBody x="50%" y="50%">
                    <h1 className="text-4xl md:text-5xl font-bold text-foreground">
                      Community Directory
                    </h1>
                  </MatterBody>
                </Gravity>
              </div>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Discover amazing people, build meaningful connections, and grow your network within our 
                inclusive LGBTQ+ community.
              </p>
            </div>
            
            {/* Stats */}
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full">
                <Users className="h-4 w-4 text-primary" />
                <span className="font-medium">{profiles?.length || 0} Members</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 rounded-full">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <span className="font-medium">Active Community</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-full">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="font-medium">Growing Daily</span>
              </div>
            </div>
          </CardContent>
        </Card>
          
        {/* Search and Filter Section */}
        <Card className="bg-gradient-to-r from-card to-card/90 border-2 shadow-lg">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search by name, bio, location, or interests..."
                    value={filters.searchQuery}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                    className="pl-10 h-12 text-base border-2 focus:border-primary/50 transition-colors"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={nearMe ? "default" : "outline"}
                    onClick={handleNearMeToggle}
                    disabled={isDetectingLocation}
                    size="icon"
                    className={`h-12 w-12 ${nearMe ? 'bg-gradient-primary hover:opacity-90' : ''}`}
                  >
                    {isDetectingLocation ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Navigation className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowFilters(!showFilters)}
                    size="icon"
                    className="relative h-12 w-12 hover:bg-accent/50 transition-colors"
                  >
                    <Filter className="h-4 w-4" />
                    {activeFiltersCount > 0 && (
                      <Badge variant="secondary" className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs flex items-center justify-center bg-primary text-primary-foreground">
                        {activeFiltersCount}
                      </Badge>
                    )}
                  </Button>
                </div>
              </div>

              {/* Advanced Filters */}
              {showFilters && (
                <div className="animate-fade-in">
                  <Card className="bg-background/80 backdrop-blur border-2 border-dashed border-muted">
                    <CardContent className="p-6">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Star className="h-5 w-5 text-primary" />
                            <h3 className="text-lg font-semibold">Advanced Filters</h3>
                          </div>
                          {activeFiltersCount > 0 && (
                            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-2 hover:bg-destructive/10 hover:text-destructive">
                              <X className="h-4 w-4" />
                              Clear All ({activeFiltersCount})
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {/* Location Filter */}
                          <div className="space-y-3">
                            <Label className="text-sm font-medium flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary" />
                              Location
                            </Label>
                            <Input
                              placeholder="Enter city or region"
                              value={filters.location}
                              onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
                              className="border-2 focus:border-primary/50"
                            />
                          </div>

                          {/* Age Range Filter */}
                          <div className="space-y-3">
                            <Label className="text-sm font-medium flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-primary" />
                              Age Range
                            </Label>
                            <Select value={filters.ageRange} onValueChange={(value) => setFilters(prev => ({ ...prev, ageRange: value }))}>
                              <SelectTrigger className="border-2 focus:border-primary/50">
                                <SelectValue placeholder="Select age range" />
                              </SelectTrigger>
                              <SelectContent className="bg-background backdrop-blur border-2">
                                <SelectItem value="all">All ages</SelectItem>
                                {ageRanges.map((range) => (
                                  <SelectItem key={range} value={range}>{range}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Relationship Status */}
                          <div className="space-y-3">
                            <Label className="text-sm font-medium flex items-center gap-2">
                              <Heart className="h-4 w-4 text-primary" />
                              Relationship Status
                            </Label>
                            <Select value={filters.relationshipStatus} onValueChange={(value) => setFilters(prev => ({ ...prev, relationshipStatus: value }))}>
                              <SelectTrigger className="border-2 focus:border-primary/50">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                              <SelectContent className="bg-background backdrop-blur border-2">
                                <SelectItem value="all">Any status</SelectItem>
                                {relationshipStatuses.map((status) => (
                                  <SelectItem key={status} value={status}>{status}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Occupation */}
                          <div className="space-y-3">
                            <Label className="text-sm font-medium flex items-center gap-2">
                              <Briefcase className="h-4 w-4 text-primary" />
                              Occupation
                            </Label>
                            <Input
                              placeholder="Enter occupation"
                              value={filters.occupation}
                              onChange={(e) => setFilters(prev => ({ ...prev, occupation: e.target.value }))}
                              className="border-2 focus:border-primary/50"
                            />
                          </div>

                          {/* Education */}
                          <div className="space-y-3">
                            <Label className="text-sm font-medium flex items-center gap-2">
                              <GraduationCap className="h-4 w-4 text-primary" />
                              Education
                            </Label>
                            <Select value={filters.education} onValueChange={(value) => setFilters(prev => ({ ...prev, education: value }))}>
                              <SelectTrigger className="border-2 focus:border-primary/50">
                                <SelectValue placeholder="Select education" />
                              </SelectTrigger>
                              <SelectContent className="bg-background backdrop-blur border-2">
                                <SelectItem value="all">Any education</SelectItem>
                                {educationLevels.map((level) => (
                                  <SelectItem key={level} value={level}>{level}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Gender Identity */}
                          <div className="space-y-3">
                            <Label className="text-sm font-medium flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              Gender Identity
                            </Label>
                            <Select value={filters.genderIdentity} onValueChange={(value) => setFilters(prev => ({ ...prev, genderIdentity: value }))}>
                              <SelectTrigger className="border-2 focus:border-primary/50">
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                              <SelectContent className="bg-background backdrop-blur border-2">
                                <SelectItem value="all">Any gender</SelectItem>
                                {genderIdentities.map((gender) => (
                                  <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Interests Filter */}
                        <div className="space-y-3">
                          <Label className="text-sm font-medium flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Interests
                          </Label>
                          <Popover open={interestsOpen} onOpenChange={setInterestsOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={interestsOpen}
                                className="w-full justify-between border-2"
                              >
                                {filters.interests.length > 0
                                  ? `${filters.interests.length} interest${filters.interests.length !== 1 ? 's' : ''} selected`
                                  : "Select interests..."}
                                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0 bg-background backdrop-blur border-2">
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
                            <div className="flex flex-wrap gap-2 mt-2">
                              {filters.interests.map((interest) => (
                                <Badge key={interest} variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
                                  <Sparkles className="h-3 w-3" />
                                  {interest}
                                  <X
                                    className="h-3 w-3 cursor-pointer hover:text-destructive"
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
                            <Label htmlFor="verified" className="text-sm">Verified profiles</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="business"
                              checked={filters.isBusiness}
                              onCheckedChange={(checked) => setFilters(prev => ({ ...prev, isBusiness: !!checked }))}
                            />
                            <Label htmlFor="business" className="text-sm">Business accounts</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="children"
                              checked={filters.hasChildren}
                              onCheckedChange={(checked) => setFilters(prev => ({ ...prev, hasChildren: !!checked }))}
                            />
                            <Label htmlFor="children" className="text-sm">Has children</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pets"
                              checked={filters.hasPets}
                              onCheckedChange={(checked) => setFilters(prev => ({ ...prev, hasPets: !!checked }))}
                            />
                            <Label htmlFor="pets" className="text-sm">Has pets</Label>
                          </div>
                        </div>

                        {/* Sort Options */}
                        <div className="space-y-3">
                          <Label className="text-sm font-medium flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            Sort By
                          </Label>
                          <Select value={filters.sortBy} onValueChange={(value) => setFilters(prev => ({ ...prev, sortBy: value as any }))}>
                            <SelectTrigger className="w-full md:w-[200px] border-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-background backdrop-blur border-2">
                              <SelectItem value="newest">Newest members</SelectItem>
                              <SelectItem value="oldest">Oldest members</SelectItem>
                              <SelectItem value="alphabetical">Alphabetical</SelectItem>
                              <SelectItem value="last_active">Last active</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Active Filters Display */}
              {activeFiltersCount > 0 && !showFilters && (
                <div className="animate-fade-in">
                  <div className="flex flex-wrap gap-2 items-center justify-center p-4 bg-accent/30 rounded-lg border">
                    <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Active filters:
                    </span>
                    {nearMe && (
                      <Badge variant="secondary" className="gap-1 bg-blue-500/10 text-blue-700 border-blue-200">
                        <Navigation className="h-3 w-3" />
                        Near Me
                        <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={handleNearMeToggle} />
                      </Badge>
                    )}
                    {filters.location && (
                      <Badge variant="secondary" className="gap-1">
                        <MapPin className="h-3 w-3" />
                        {filters.location}
                        <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => setFilters(prev => ({ ...prev, location: "" }))} />
                      </Badge>
                    )}
                    {filters.ageRange && filters.ageRange !== 'all' && (
                      <Badge variant="secondary" className="gap-1">
                        <Calendar className="h-3 w-3" />
                        {filters.ageRange}
                        <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => setFilters(prev => ({ ...prev, ageRange: "all" }))} />
                      </Badge>
                    )}
                    {filters.interests.map((interest) => (
                      <Badge key={interest} variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
                        <Sparkles className="h-3 w-3" />
                        {interest}
                        <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => handleInterestToggle(interest)} />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {isLoading ? (
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium text-primary">Finding amazing people...</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="p-6 animate-pulse border-2">
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="w-16 h-16 bg-muted rounded-full" />
                    <div className="space-y-2 flex-1">
                      <div className="h-5 bg-muted rounded w-3/4" />
                      <div className="h-4 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="flex gap-2">
                      <div className="h-6 bg-muted rounded w-16" />
                      <div className="h-6 bg-muted rounded w-20" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Results Header */}
            {profiles && profiles.length > 0 && (
              <div className="flex items-center justify-between p-4 bg-accent/20 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="font-medium">
                    {profiles.length} member{profiles.length !== 1 ? 's' : ''} found
                  </span>
                  {activeFiltersCount > 0 && (
                    <Badge variant="outline" className="text-xs">
                      Filtered
                    </Badge>
                  )}
                </div>
                <Select value={filters.sortBy} onValueChange={(value) => setFilters(prev => ({ ...prev, sortBy: value as any }))}>
                  <SelectTrigger className="w-auto border-0 bg-transparent">
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
            )}

            {/* User Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {profiles?.map((profile) => (
                <Link key={profile.user_id} to={`/user/${profile.user_id}`} className="block group">
                  <Card className="p-6 h-full hover:shadow-elegant transition-all duration-300 hover-scale border-2 hover:border-primary/20 animate-fade-in group-hover:bg-accent/30">
                    <div className="flex items-start space-x-4 mb-4">
                      <div className="relative group/avatar">
                        <Avatar className="h-16 w-16 border-4 border-background shadow-lg group-hover:scale-110 transition-transform duration-300">
                          <AvatarImage src={profile.avatar_url || undefined} />
                          <AvatarFallback className="bg-gradient-primary text-primary-foreground text-lg font-bold">
                            {profile.display_name?.charAt(0)?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        {profile.verified_identity && (
                          <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-primary rounded-full flex items-center justify-center shadow-lg animate-pulse">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-transparent opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-foreground truncate group-hover:text-primary transition-colors duration-300">
                          {profile.display_name || "Anonymous User"}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          {profile.pronouns && <span className="font-medium">{profile.pronouns}</span>}
                          {profile.age_range && (
                            <>
                              {profile.pronouns && <span>•</span>}
                              <span>{profile.age_range}</span>
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(profile as any)?.user_mode && (
                            <UserModeBadge mode={(profile as any).user_mode} size="sm" />
                          )}
                          {profile.is_business && (
                            <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-200 text-blue-700">
                              <Briefcase className="h-3 w-3 mr-1" />
                              Business
                            </Badge>
                          )}
                          {profile.verified_identity && (
                            <Badge variant="outline" className="text-xs bg-green-500/10 border-green-200 text-green-700">
                              <Check className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {profile.bio && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
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
                    <div className="flex flex-wrap gap-2 mb-4">
                      {profile.relationship_status && (
                        <Badge variant="outline" className="text-xs bg-pink-500/10 border-pink-200 text-pink-700">
                          <Heart className="h-3 w-3 mr-1" />
                          {profile.relationship_status}
                        </Badge>
                      )}
                      {profile.has_children && (
                        <Badge variant="outline" className="text-xs bg-orange-500/10 border-orange-200 text-orange-700">
                          Children
                        </Badge>
                      )}
                      {profile.has_pets && (
                        <Badge variant="outline" className="text-xs bg-amber-500/10 border-amber-200 text-amber-700">
                          Pets
                        </Badge>
                      )}
                      {profile.gender_identity && (
                        <Badge variant="secondary" className="text-xs bg-purple-500/10 border-purple-200 text-purple-700">
                          {profile.gender_identity}
                        </Badge>
                      )}
                    </div>

                    {/* Action Footer */}
                    <div className="mt-auto flex items-center justify-between pt-4 border-t border-border/50">
                      {profile.website ? (
                        <a
                          href={profile.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-center gap-1 font-medium transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Visit Website
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <div />
                      )}
                      
                      <div onClick={(e) => e.stopPropagation()}>
                        <StartConversationButton
                          userId={profile.user_id}
                          userName={profile.display_name || "Anonymous User"}
                          variant="outline"
                          size="sm"
                          className="hover:bg-primary hover:text-primary-foreground transition-colors"
                        />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {profiles && profiles.length === 0 && (
          <Card className="border-2 border-dashed border-muted">
            <CardContent className="p-12 text-center space-y-6">
              <div className="relative">
                <Users className="mx-auto h-16 w-16 text-muted-foreground/50" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <Search className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-foreground">No members found</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  {filters.searchQuery || activeFiltersCount > 0
                    ? "Try adjusting your search terms or filters to discover more amazing people in our community." 
                    : "Be among the first to join our growing community of inclusive and welcoming members!"}
                </p>
              </div>
              {(filters.searchQuery || activeFiltersCount > 0) && (
                <Button variant="outline" onClick={clearAllFilters} className="gap-2">
                  <X className="h-4 w-4" />
                  Clear all filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default UserDirectory;