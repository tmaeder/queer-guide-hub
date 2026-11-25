import React from 'react';
import { Card } from '@/components/ui/card';
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
  MapPin,
  Users,
  X,
  Check,
  Briefcase,
  GraduationCap,
  Heart,
  ExternalLink,
} from '@/components/icons';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';
import { USER_MODE_LABELS } from '@/lib/userMode';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { Profile, UserFilters } from '@/hooks/useUserDirectoryQuery';
import { useDatingMarks } from '@/hooks/useIntimateProfile';

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
  const { data: datingIds } = useDatingMarks(
    isAuthed ? (profiles ?? []).map((p) => p.user_id) : [],
  );

  return (
    <div className="flex flex-col gap-6">
      {hasProfiles && (
        <div className="flex items-center justify-between p-4 bg-muted rounded-element">
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
                sortBy: value as 'newest' | 'oldest' | 'alphabetical' | 'last_active' | 'match',
              }))
            }
          >
            {/* Chromeless sort control. `text-foreground` is not redundant
                here: stripping the primitive's fill without restating the type
                colour is exactly the coupling that once shipped near-white
                text on a light surface at 1.09:1 — see
                inputPlateOverride.test.ts, which now covers SelectTrigger. */}
            <SelectTrigger className="w-auto border-0 bg-transparent text-foreground shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="match">Best match</SelectItem>
              <SelectItem value="newest">Newest members</SelectItem>
              <SelectItem value="oldest">Oldest members</SelectItem>
              <SelectItem value="alphabetical">Alphabetical</SelectItem>
              <SelectItem value="last_active">Last active</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {hasProfiles && (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => {
            const joined = profile.created_at ? new Date(profile.created_at) : null;
            const joinedValid = joined && !Number.isNaN(joined.getTime());
            const mode = typeof profile.user_mode === 'string' ? profile.user_mode : null;
            const dating = !!datingIds?.has(profile.user_id);

            const name = profile.display_name || 'Anonymous member';
            const meta = [
              mode ? USER_MODE_LABELS[mode] : null,
              isAuthed ? profile.pronouns : null,
              isAuthed ? profile.age_range : null,
              joinedValid
                ? `Joined ${joined.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
                : null,
            ].filter(Boolean);
            const chips = isAuthed
              ? ([
                  profile.location && { icon: MapPin, label: profile.location },
                  profile.occupation && { icon: Briefcase, label: profile.occupation },
                  profile.education && { icon: GraduationCap, label: profile.education },
                  profile.gender_identity && { label: profile.gender_identity },
                ].filter(Boolean) as { icon?: typeof MapPin; label: string }[])
              : [];

            return (
              <li key={profile.user_id} className="group relative h-full">
                <Card className="flex h-full flex-col gap-4 p-4 transition-colors group-hover:bg-muted/40">
                  <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      <Avatar className="h-14 w-14">
                        <AvatarImage src={profile.avatar_url || undefined} alt="" />
                        <AvatarFallback className="bg-foreground text-background text-lg font-semibold">
                          {name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {profile.verified_identity && (
                        <span
                          aria-label="Verified"
                          className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-foreground text-background"
                        >
                          <Check size={10} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-title font-bold">{name}</h3>
                      {meta.length > 0 && (
                        <p className="truncate text-13 text-muted-foreground">{meta.join(' · ')}</p>
                      )}
                    </div>
                    {isAuthed && (
                      <div className="relative z-10 shrink-0">
                        <StartConversationButton
                          userId={profile.user_id}
                          userName={name}
                          variant="soft"
                          iconOnly
                        />
                      </div>
                    )}
                  </div>

                  {isAuthed && profile.bio && (
                    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {profile.bio}
                    </p>
                  )}

                  {(chips.length > 0 || profile.is_business || dating) && (
                    <div className="flex flex-wrap gap-1.5">
                      {dating && (
                        <LocalizedLink
                          to={`/user/${profile.user_id}/dating`}
                          className="relative z-10 no-underline"
                        >
                          <Badge variant="soft" className="gap-1 text-xs">
                            <Heart size={12} aria-hidden />
                            Dating
                          </Badge>
                        </LocalizedLink>
                      )}
                      {profile.is_business && (
                        <Badge variant="soft" className="gap-1 text-xs">
                          <Briefcase size={12} aria-hidden />
                          Business
                        </Badge>
                      )}
                      {chips.slice(0, 4).map(({ icon: Icon, label }) => (
                        <Badge key={label} variant="soft" className="max-w-full gap-1 text-xs">
                          {Icon && <Icon size={12} aria-hidden />}
                          <span className="truncate">{label}</span>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 mt-auto inline-flex items-center gap-1 self-start text-sm font-medium text-foreground"
                    >
                      Website
                      <ExternalLink size={12} aria-hidden />
                    </a>
                  )}
                </Card>
                {/* Card-wide click target. Overlay sibling (not a wrapper) so the
                    card's website link and message button are never nested inside
                    an <a>. `no-underline` is load-bearing: `li a:not(.no-underline)`
                    in index.css forces position:relative. */}
                <LocalizedLink
                  to={`/user/${profile.user_id}`}
                  aria-label={name}
                  className="absolute inset-0 rounded-container no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </li>
            );
          })}
        </ul>
      )}

      {profiles && profiles.length === 0 && (
        <section role="status" className="flex flex-col items-start gap-4 py-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-foreground">No members found</h2>
            <p className="text-muted-foreground max-w-reading">
              {filters.searchQuery || activeFiltersCount > 0
                ? 'Try adjusting your search terms or filters.'
                : 'No public profiles yet. Sign in and complete your profile to be the first.'}
            </p>
          </div>
          {(filters.searchQuery || activeFiltersCount > 0) && (
            <Button variant="soft" onClick={clearAllFilters} className="gap-2">
              <X size={16} />
              Clear all filters
            </Button>
          )}
        </section>
      )}
    </div>
  );
};
