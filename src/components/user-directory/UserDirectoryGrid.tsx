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
  return (
    <>
      <div className="flex flex-col gap-6">
        {profiles && profiles.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-muted rounded-element border border-border">
            <div className="flex items-center gap-2">
              <Users size={20} />
              <span className="font-medium">
                {profiles.length} member{profiles.length !== 1 ? 's' : ''} found
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
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {profiles?.map((profile) => (
            <LocalizedLink
              key={profile.user_id}
              to={`/user/${profile.user_id}`}
              style={{ color: 'inherit' }}
              className="block no-underline"
            >
              <Card
                style={{ height: '100%', transition: 'all 0.3s', border: '2px solid' }}
                className="p-6"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="relative">
                    <Avatar style={{ height: 64, width: 64 }}>
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback
                        style={{ backgroundColor: '#333333', color: '#ffffff' }}
                        className="text-lg font-bold"
                      >
                        {profile.display_name?.charAt(0)?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    {profile.verified_identity && (
                      <div
                        className="absolute rounded-full flex items-center justify-center"
                        style={{
                          top: -4,
                          right: -4,
                          width: 24,
                          height: 24,
                          backgroundColor: '#333333',
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        }}
                      >
                        <Check size={12} className="text-background" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h6 className="font-bold text-foreground truncate text-lg">
                      {profile.display_name || 'Anonymous User'}
                    </h6>
                    {isAuthed && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        {profile.pronouns && (
                          <span className="font-medium">{profile.pronouns}</span>
                        )}
                        {profile.age_range && (
                          <>
                            {profile.pronouns && <span>•</span>}
                            <span>{profile.age_range}</span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        const mode = (profile as Record<string, unknown>)?.user_mode;
                        return typeof mode === 'string' && mode.length > 0
                          ? <UserModeBadge mode={mode} size="sm" />
                          : null;
                      })()}
                      {profile.is_business && (
                        <Badge
                          variant="outline"
                          style={{
                            backgroundColor: '#eff6ff',
                            borderColor: '#bfdbfe',
                            color: '#1d4ed8',
                          }}
                          className="text-xs"
                        >
                          <Briefcase size={12} className="mr-1" />
                          Business
                        </Badge>
                      )}
                      {profile.verified_identity && (
                        <Badge
                          variant="outline"
                          style={{
                            backgroundColor: '#f0fdf4',
                            borderColor: '#bbf7d0',
                            color: '#15803d',
                          }}
                          className="text-xs"
                        >
                          <Check size={12} className="mr-1" />
                          Verified
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {isAuthed && profile.bio && (
                  <p
                    className="text-sm text-muted-foreground mb-4 overflow-hidden"
                    style={{
                      lineHeight: 1.75,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {profile.bio}
                  </p>
                )}

                {isAuthed && (
                  <div className="flex flex-col gap-2 mb-4">
                    {profile.location && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <MapPin size={16} className="mr-2" />
                        {profile.location}
                      </div>
                    )}

                    {profile.occupation && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Briefcase size={16} className="mr-2" />
                        {profile.occupation}
                      </div>
                    )}

                    {profile.education && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <GraduationCap size={16} className="mr-2" />
                        {profile.education}
                      </div>
                    )}

                    {(() => {
                      const joined = profile.created_at ? new Date(profile.created_at) : null;
                      if (!joined || Number.isNaN(joined.getTime())) return null;
                      return (
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Calendar size={16} className="mr-2" />
                          Joined {joined.toLocaleDateString()}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {isAuthed && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {profile.relationship_status && (
                      <Badge
                        variant="outline"
                        style={{
                          backgroundColor: '#fdf2f8',
                          borderColor: '#fbcfe8',
                          color: '#be185d',
                        }}
                        className="text-xs"
                      >
                        <Heart size={12} className="mr-1" />
                        {profile.relationship_status}
                      </Badge>
                    )}
                    {profile.has_children && (
                      <Badge
                        variant="outline"
                        style={{
                          backgroundColor: '#fff7ed',
                          borderColor: '#fed7aa',
                          color: '#c2410c',
                        }}
                        className="text-xs"
                      >
                        Children
                      </Badge>
                    )}
                    {profile.has_pets && (
                      <Badge
                        variant="outline"
                        style={{
                          backgroundColor: '#fffbeb',
                          borderColor: '#fde68a',
                          color: '#b45309',
                        }}
                        className="text-xs"
                      >
                        Pets
                      </Badge>
                    )}
                    {profile.gender_identity && (
                      <Badge
                        variant="secondary"
                        style={{ borderColor: '#e9d5ff' }}
                        className="text-xs"
                      >
                        {profile.gender_identity}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 mt-auto">
                  {profile.website ? (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium flex items-center gap-1 hover:underline no-underline"
                      style={{ color: 'hsl(var(--primary))' }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      Visit Website
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <div />
                  )}

                  <div
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <StartConversationButton
                      userId={profile.user_id}
                      userName={profile.display_name || 'Anonymous User'}
                      variant="outline"
                      size="sm"
                      style={{ transition: 'all 0.2s' }}
                    />
                  </div>
                </div>
              </Card>
            </LocalizedLink>
          ))}
        </div>
      </div>

      {profiles && profiles.length === 0 && (
        <Card>
          <CardContent style={{ flexDirection: 'column' }} className="p-12 text-center flex gap-6">
            <div className="relative inline-block mx-auto">
              <Users size={64} />
              <div
                className="absolute bg-muted rounded-full flex items-center justify-center"
                style={{ top: -8, right: -8, width: 32, height: 32 }}
              >
                <Search size={16} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h6 className="font-semibold text-foreground text-xl">No members found</h6>
              <p className="text-muted-foreground mx-auto" style={{ maxWidth: '28rem' }}>
                {filters.searchQuery || activeFiltersCount > 0
                  ? 'Try adjusting your search terms or filters to find more people.'
                  : 'Be among the first to join our growing community of inclusive and welcoming members!'}
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
    </>
  );
};
