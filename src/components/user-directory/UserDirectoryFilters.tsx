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

export const UserDirectoryFilters: React.FC<UserDirectoryFiltersProps> = ({
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
}) => {
  return (
    <div className="border border-border rounded-md bg-background">
      <CardContent style={{ padding: 20 }}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
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
            </div>
            <div className="flex gap-2">
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
                  <Loader2 style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }} />
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
            </div>
          </div>

          {showFilters && isAuthed && (
            <div>
              <Card style={{}}>
                <CardContent style={{ padding: 24 }}>
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star style={{ height: 20, width: 20 }} />
                        <h2 className="text-lg font-semibold">Advanced Filters</h2>
                      </div>
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
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="flex flex-col gap-3">
                        <Label className={labelCls}>
                          <MapPin style={{ height: 16, width: 16 }} />
                          Location
                        </Label>
                        <Input
                          placeholder="Enter city or region"
                          value={filters.location}
                          onChange={(e) =>
                            setFilters((prev) => ({ ...prev, location: e.target.value }))
                          }
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        <Label className={labelCls}>
                          <Calendar style={{ height: 16, width: 16 }} />
                          Age Range
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

                      <div className="flex flex-col gap-3">
                        <Label className={labelCls}>
                          <Heart style={{ height: 16, width: 16 }} />
                          Relationship Status
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

                      <div className="flex flex-col gap-3">
                        <Label className={labelCls}>
                          <Briefcase style={{ height: 16, width: 16 }} />
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

                      <div className="flex flex-col gap-3">
                        <Label className={labelCls}>
                          <GraduationCap style={{ height: 16, width: 16 }} />
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

                      <div className="flex flex-col gap-3">
                        <Label className={labelCls}>
                          <Users style={{ height: 16, width: 16 }} />
                          Gender Identity
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

                    <div className="flex flex-col gap-3">
                      <Label className={labelCls}>
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
                        <PopoverContent style={{ width: '100%', padding: 0, border: '2px solid' }}>
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
                        <div className="flex flex-wrap gap-2 mt-2">
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

                    <div className="flex flex-col gap-3">
                      <Label className={labelCls}>
                        <TrendingUp style={{ height: 16, width: 16 }} />
                        Sort By
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
                        <SelectTrigger style={{ width: 200, border: '2px solid' }}>
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
            </div>
          )}

          {activeFiltersCount > 0 && !showFilters && (
            <div>
              <div className="flex flex-wrap gap-2 items-center justify-center p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Filter style={{ height: 16, width: 16 }} />
                  Active filters:
                </span>
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
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </div>
  );
};
