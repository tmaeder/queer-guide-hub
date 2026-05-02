import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
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

export const UserDirectoryGrid: React.FC<UserDirectoryGridProps> = ({
  profiles,
  filters,
  setFilters,
  activeFiltersCount,
  isAuthed,
  clearAllFilters,
}) => {
  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
          </Paper>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' },
            gap: 3,
          }}
        >
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
                    {isAuthed && (
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
                    </Box>
                  </Box>
                </Box>

                {isAuthed && profile.bio && (
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

                {isAuthed && (
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

                {isAuthed && (
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

                <Box
                  sx={{
                    mt: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    pt: 2,
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
            </LocalizedLink>
          ))}
        </Box>
      </Box>

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
    </>
  );
};
