import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Sparkles,
  TrendingUp,
  Star,
} from 'lucide-react';
import {
  UserFilters,
  ageRanges,
  relationshipStatuses,
  educationLevels,
  genderIdentities,
  commonInterests,
} from '@/hooks/useUserDirectoryQuery';

interface UserDirectoryFiltersProps {
  filters: UserFilters;
  setFilters: React.Dispatch<React.SetStateAction<UserFilters>>;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  interestsOpen: boolean;
  setInterestsOpen: (v: boolean) => void;
  nearMe: boolean;
  isDetectingLocation: boolean;
  handleNearMeToggle: () => void;
  activeFiltersCount: number;
  clearAllFilters: () => void;
  handleInterestToggle: (interest: string) => void;
  isAuthed: boolean;
}

const labelCls = 'text-sm font-medium flex items-center gap-2';

export const UserDirectoryFilters = ({
  filters,
  setFilters,
  showFilters,
  setShowFilters,
  interestsOpen,
  setInterestsOpen,
  nearMe,
  isDetectingLocation,
  handleNearMeToggle,
  activeFiltersCount,
  clearAllFilters,
  handleInterestToggle,
  isAuthed,
}: UserDirectoryFiltersProps) => {
  return (
    <div className="border border-border rounded-container bg-background">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search
                aria-hidden
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              />
              <Input
                placeholder="Search by name, bio, or location…"
                value={filters.searchQuery}
                onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
                className="pl-10 h-12 text-base"
                aria-label="Search members"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={nearMe ? 'default' : 'outline'}
                onClick={handleNearMeToggle}
                disabled={isDetectingLocation}
                size="icon"
                className="h-12 w-12"
                aria-label={nearMe ? 'Disable near-me filter' : 'Find members near me'}
                aria-pressed={nearMe}
              >
                {isDetectingLocation ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Navigation size={16} />
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                size="icon"
                className="relative h-12 w-12"
                aria-label={showFilters ? 'Hide filters' : 'Show filters'}
                aria-expanded={showFilters}
              >
                <Filter size={16} />
                {activeFiltersCount > 0 && (
                  <Badge
                    variant="default"
                    className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-2xs"
                  >
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {showFilters && isAuthed && (
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star size={18} />
                      <h2 className="text-lg font-semibold">Filters</h2>
                    </div>
                    {activeFiltersCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFilters}
                        className="gap-2"
                      >
                        <X size={16} />
                        Clear all ({activeFiltersCount})
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-2">
                      <Label className={labelCls}>
                        <MapPin size={14} />
                        Location
                      </Label>
                      <Input
                        placeholder="City or region"
                        value={filters.location}
                        onChange={(e) =>
                          setFilters((prev) => ({ ...prev, location: e.target.value }))
                        }
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label className={labelCls}>
                        <Calendar size={14} />
                        Age range
                      </Label>
                      <Select
                        value={filters.ageRange}
                        onValueChange={(value) =>
                          setFilters((prev) => ({ ...prev, ageRange: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select age range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All ages</SelectItem>
                          {ageRanges.map((range) => (
                            <SelectItem key={range} value={range}>
                              {range}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label className={labelCls}>
                        <Heart size={14} />
                        Relationship status
                      </Label>
                      <Select
                        value={filters.relationshipStatus}
                        onValueChange={(value) =>
                          setFilters((prev) => ({ ...prev, relationshipStatus: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Any status</SelectItem>
                          {relationshipStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label className={labelCls}>
                        <Briefcase size={14} />
                        Occupation
                      </Label>
                      <Input
                        placeholder="Enter occupation"
                        value={filters.occupation}
                        onChange={(e) =>
                          setFilters((prev) => ({ ...prev, occupation: e.target.value }))
                        }
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label className={labelCls}>
                        <GraduationCap size={14} />
                        Education
                      </Label>
                      <Select
                        value={filters.education}
                        onValueChange={(value) =>
                          setFilters((prev) => ({ ...prev, education: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select education" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Any education</SelectItem>
                          {educationLevels.map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label className={labelCls}>
                        <Users size={14} />
                        Gender identity
                      </Label>
                      <Select
                        value={filters.genderIdentity}
                        onValueChange={(value) =>
                          setFilters((prev) => ({ ...prev, genderIdentity: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Any gender</SelectItem>
                          {genderIdentities.map((gender) => (
                            <SelectItem key={gender} value={gender}>
                              {gender}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label className={labelCls}>
                      <Sparkles size={14} />
                      Interests
                    </Label>
                    <Popover open={interestsOpen} onOpenChange={setInterestsOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={interestsOpen}
                          className="w-full justify-between font-normal"
                        >
                          {filters.interests.length > 0
                            ? `${filters.interests.length} interest${filters.interests.length !== 1 ? 's' : ''} selected`
                            : 'Select interests…'}
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                        <Command>
                          <CommandInput placeholder="Search interests..." />
                          <CommandList>
                            <CommandEmpty>No interests found.</CommandEmpty>
                            <CommandGroup>
                              {commonInterests.map((interest) => {
                                const selected = filters.interests.includes(interest);
                                return (
                                  <CommandItem
                                    key={interest}
                                    value={interest}
                                    onSelect={() => handleInterestToggle(interest)}
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${selected ? 'opacity-100' : 'opacity-0'}`}
                                    />
                                    {interest}
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {filters.interests.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {filters.interests.map((interest) => (
                          <Badge key={interest} variant="soft" className="gap-1">
                            <Sparkles size={12} />
                            {interest}
                            <button
                              type="button"
                              onClick={() => handleInterestToggle(interest)}
                              className="cursor-pointer"
                              aria-label={`Remove ${interest}`}
                            >
                              <X size={12} />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="verified"
                        checked={filters.isVerified}
                        onCheckedChange={(checked) =>
                          setFilters((prev) => ({ ...prev, isVerified: !!checked }))
                        }
                      />
                      <Label htmlFor="verified" className="text-sm">
                        Verified profiles
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="business"
                        checked={filters.isBusiness}
                        onCheckedChange={(checked) =>
                          setFilters((prev) => ({ ...prev, isBusiness: !!checked }))
                        }
                      />
                      <Label htmlFor="business" className="text-sm">
                        Business accounts
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="children"
                        checked={filters.hasChildren}
                        onCheckedChange={(checked) =>
                          setFilters((prev) => ({ ...prev, hasChildren: !!checked }))
                        }
                      />
                      <Label htmlFor="children" className="text-sm">
                        Has children
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="pets"
                        checked={filters.hasPets}
                        onCheckedChange={(checked) =>
                          setFilters((prev) => ({ ...prev, hasPets: !!checked }))
                        }
                      />
                      <Label htmlFor="pets" className="text-sm">
                        Has pets
                      </Label>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label className={labelCls}>
                      <TrendingUp size={14} />
                      Sort by
                    </Label>
                    <Select
                      value={filters.sortBy}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          sortBy: value as 'newest' | 'oldest' | 'alphabetical' | 'last_active',
                        }))
                      }
                    >
                      <SelectTrigger className="w-full sm:w-56">
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
              </CardContent>
            </Card>
          )}

          {activeFiltersCount > 0 && !showFilters && (
            <div className="flex flex-wrap gap-2 items-center justify-center p-4 bg-muted rounded-element">
              <span className="text-sm font-medium text-muted-foreground inline-flex items-center gap-2">
                <Filter size={14} />
                Active filters:
              </span>
              {nearMe && (
                <Badge variant="soft" className="gap-1">
                  <Navigation size={12} />
                  Near me
                  <button
                    type="button"
                    aria-label="Remove near-me filter"
                    onClick={handleNearMeToggle}
                    className="cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {filters.location && (
                <Badge variant="soft" className="gap-1">
                  <MapPin size={12} />
                  {filters.location}
                  <button
                    type="button"
                    aria-label="Remove location filter"
                    onClick={() => setFilters((prev) => ({ ...prev, location: '' }))}
                    className="cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {filters.ageRange && filters.ageRange !== 'all' && (
                <Badge variant="soft" className="gap-1">
                  <Calendar size={12} />
                  {filters.ageRange}
                  <button
                    type="button"
                    aria-label="Remove age filter"
                    onClick={() => setFilters((prev) => ({ ...prev, ageRange: 'all' }))}
                    className="cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {filters.interests.map((interest) => (
                <Badge key={interest} variant="soft" className="gap-1">
                  <Sparkles size={12} />
                  {interest}
                  <button
                    type="button"
                    aria-label={`Remove ${interest}`}
                    onClick={() => handleInterestToggle(interest)}
                    className="cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </div>
  );
};
