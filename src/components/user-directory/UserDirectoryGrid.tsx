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
}) => {
  return (
    <>
      <div className="flex flex-col gap-6">
        {profiles && profiles.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <Users style={{ height: 20, width: 20 }} />
              <span className="font-medium">
                {profiles.length} member{profiles.length !== 1 ? 's' : ''} found
              </span>
              {activeFiltersCount > 0 && (
                <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
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
                <div className="flex items-start gap-4 mb-4">
                  <div className="relative">
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
                      <div
                        className="absolute rounded-full flex items-center justify-center shadow-md"
                        style={{
                          top: -4,
                          right: -4,
                          width: 24,
                          height: 24,
                          backgroundColor: '#333333',
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        }}
                      >
                        <Check style={{ height: 12, width: 12, color: '#ffffff' }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h6 className="font-bold text-foreground truncate" style={{ fontSize: '1.125rem' }}>
                      {profile.display_name || 'Anonymous User'}
                    </h6>
                    {isAuthed && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        {profile.pronouns && (
                          <span className="font-medium">
                            {profile.pronouns}
                          </span>
                        )}
                        {profile.age_range && (
                          <>
                            {profile.pronouns && (
                              <span>•</span>
                            )}
                            <span>
                              {profile.age_range}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {(profile as Record<string, unknown>)?.user_mode && (
                        <UserModeBadge
                          mode={(profile as Record<string, unknown>).user_mode}
                          size="sm"
                        />
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
                    </div>
                  </div>
                </div>

                {isAuthed && profile.bio && (
                  <p
                    className="text-sm text-muted-foreground mb-4"
                    style={{
                      lineHeight: 1.75,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {profile.bio}
                  </p>
                )}

                {isAuthed && (
                  <div className="flex flex-col gap-2 mb-4">
                    {profile.location && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <MapPin style={{ height: 16, width: 16, marginRight: 8 }} />
                        {profile.location}
                      </div>
                    )}

                    {profile.occupation && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Briefcase style={{ height: 16, width: 16, marginRight: 8 }} />
                        {profile.occupation}
                      </div>
                    )}

                    {profile.education && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <GraduationCap style={{ height: 16, width: 16, marginRight: 8 }} />
                        {profile.education}
                      </div>
                    )}

                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar style={{ height: 16, width: 16, marginRight: 8 }} />
                      Joined {new Date(profile.created_at).toLocaleDateString()}
                    </div>
                  </div>
                )}

                {isAuthed && (
                  <div className="flex flex-wrap gap-2 mb-4">
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
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 mt-auto">
                  {profile.website ? (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium flex items-center gap-1 hover:underline"
                      style={{ color: 'hsl(var(--primary))', textDecoration: 'none' }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      Visit Website
                      <ExternalLink style={{ height: 12, width: 12 }} />
                    </a>
                  ) : (
                    <div />
                  )}

                  <div onClick={(e) => e.stopPropagation()}>
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
          <CardContent
            style={{
              padding: 48,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            }}
          >
            <div className="relative inline-block mx-auto">
              <Users style={{ height: 64, width: 64 }} />
              <div
                className="absolute bg-muted rounded-full flex items-center justify-center"
                style={{ top: -8, right: -8, width: 32, height: 32 }}
              >
                <Search style={{ height: 16, width: 16 }} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h6 className="font-semibold text-foreground" style={{ fontSize: '1.25rem' }}>
                No members found
              </h6>
              <p className="text-muted-foreground mx-auto" style={{ maxWidth: '28rem' }}>
                {filters.searchQuery || activeFiltersCount > 0
                  ? 'Try adjusting your search terms or filters to discover more amazing people in our community.'
                  : 'Be among the first to join our growing community of inclusive and welcoming members!'}
              </p>
            </div>
            {(filters.searchQuery || activeFiltersCount > 0) && (
              <Button variant="outline" onClick={clearAllFilters} style={{ gap: 8 }}>
                <X style={{ height: 16, width: 16 }} />
                Clear all filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
};
