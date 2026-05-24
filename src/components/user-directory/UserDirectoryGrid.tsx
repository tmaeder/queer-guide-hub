import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Search,
  MapPin,
  Calendar,
  Users,
  X,
  Check,
  Heart,
  Briefcase,
  GraduationCap,
  ExternalLink,
} from 'lucide-react';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';
import { UserModeBadge } from '@/components/profile/UserModeBadge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { Profile, UserFilters } from '@/hooks/useUserDirectoryQuery';

interface UserDirectoryGridProps {
  profiles: Profile[] | undefined;
  filters: UserFilters;
  setFilters: React.Dispatch<React.SetStateAction<UserFilters>>;
  activeFiltersCount: number;
  isAuthed: boolean;
  clearAllFilters: () => void;
}

export const UserDirectoryGrid = ({
  profiles,
  filters,
  setFilters,
  activeFiltersCount,
  isAuthed,
  clearAllFilters,
}: UserDirectoryGridProps) => {
  const hasProfiles = !!profiles && profiles.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {hasProfiles && (
        <div className="flex items-center justify-between p-4 bg-muted rounded-element border border-border">
          <div className="flex items-center gap-2">
            <Users size={18} />
            <span className="font-medium">
              {profiles.length} {profiles.length === 1 ? 'member' : 'members'}
            </span>
            {activeFiltersCount > 0 && (
              <Badge variant="outline" className="text-xs">
                Filtered
              </Badge>
            )}
          </div>
          <Select
            value={filters.sortBy}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                sortBy: value as 'newest' | 'oldest' | 'alphabetical' | 'last_active',
              }))
            }
          >
            <SelectTrigger className="w-auto border-0 bg-transparent shadow-none focus:ring-0">
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

      {hasProfiles && (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 list-none p-0 m-0">
          {profiles.map((profile) => {
            const joined = profile.created_at ? new Date(profile.created_at) : null;
            const joinedValid = joined && !Number.isNaN(joined.getTime());
            const mode = typeof profile.user_mode === 'string' ? profile.user_mode : null;

            return (
              <li key={profile.user_id} className="h-full">
                <LocalizedLink
                  to={`/user/${profile.user_id}`}
                  className="block no-underline text-foreground h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-container"
                >
                  <Card className="h-full p-6 flex flex-col gap-4 transition-colors hover:bg-muted/40">
                    <div className="flex items-start gap-4">
                      <div className="relative shrink-0">
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={profile.avatar_url || undefined} alt="" />
                          <AvatarFallback className="bg-foreground text-background text-lg font-semibold">
                            {profile.display_name?.charAt(0)?.toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        {profile.verified_identity && (
                          <span
                            aria-label="Verified"
                            className="absolute -top-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background border-2 border-background"
                          >
                            <Check size={12} />
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate text-title">
                          {profile.display_name || 'Anonymous member'}
                        </h3>
                        {isAuthed && (profile.pronouns || profile.age_range) && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {profile.pronouns}
                            {profile.pronouns && profile.age_range && ' · '}
                            {profile.age_range}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {mode && <UserModeBadge mode={mode} size="sm" />}
                          {profile.is_business && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Briefcase size={12} />
                              Business
                            </Badge>
                          )}
                          {profile.verified_identity && (
                            <Badge variant="default" className="text-xs gap-1">
                              <Check size={12} />
                              Verified
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {isAuthed && profile.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {profile.bio}
                      </p>
                    )}

                    {isAuthed && (
                      <div className="flex flex-col gap-2">
                        {profile.location && (
                          <div className="flex items-center text-sm text-muted-foreground gap-2">
                            <MapPin size={14} />
                            <span className="truncate">{profile.location}</span>
                          </div>
                        )}

                        {profile.occupation && (
                          <div className="flex items-center text-sm text-muted-foreground gap-2">
                            <Briefcase size={14} />
                            <span className="truncate">{profile.occupation}</span>
                          </div>
                        )}

                        {profile.education && (
                          <div className="flex items-center text-sm text-muted-foreground gap-2">
                            <GraduationCap size={14} />
                            <span className="truncate">{profile.education}</span>
                          </div>
                        )}

                        {joinedValid && (
                          <div className="flex items-center text-sm text-muted-foreground gap-2">
                            <Calendar size={14} />
                            Joined {joined.toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    )}

                    {isAuthed && (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.relationship_status && (
                          <Badge variant="soft" className="text-xs gap-1">
                            <Heart size={12} />
                            {profile.relationship_status}
                          </Badge>
                        )}
                        {profile.has_children && (
                          <Badge variant="soft" className="text-xs">
                            Children
                          </Badge>
                        )}
                        {profile.has_pets && (
                          <Badge variant="soft" className="text-xs">
                            Pets
                          </Badge>
                        )}
                        {profile.gender_identity && (
                          <Badge variant="soft" className="text-xs">
                            {profile.gender_identity}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 mt-auto border-t border-border">
                      {profile.website ? (
                        <a
                          href={profile.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium inline-flex items-center gap-1 text-foreground"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          Visit website
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span />
                      )}

                      {isAuthed && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          role="presentation"
                        >
                          <StartConversationButton
                            userId={profile.user_id}
                            userName={profile.display_name || 'Anonymous member'}
                            variant="outline"
                            size="sm"
                          />
                        </div>
                      )}
                    </div>
                  </Card>
                </LocalizedLink>
              </li>
            );
          })}
        </ul>
      )}

      {profiles && profiles.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center flex flex-col gap-6 items-center">
            <div className="relative inline-block">
              <Users size={56} className="text-muted-foreground" />
              <span className="absolute -top-2 -right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <Search size={14} />
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="font-semibold text-foreground text-headline">No members found</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                {filters.searchQuery || activeFiltersCount > 0
                  ? 'Try adjusting your search terms or filters.'
                  : 'No public profiles yet. Sign in and complete your profile to be the first.'}
              </p>
            </div>
            {(filters.searchQuery || activeFiltersCount > 0) && (
              <Button variant="outline" onClick={clearAllFilters} className="gap-2">
                <X size={16} />
                Clear all filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
