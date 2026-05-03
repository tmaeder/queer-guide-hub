import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  ExternalLink,
  Calendar,
  MapPin,
  Briefcase,
  Star,
  Share2,
  Heart,
  Verified,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { SocialLinksDisplay } from '@/components/profile/SocialLinksDisplay';
import type { Personality } from '@/hooks/usePersonalities';
import { fetchPublicPersonalityBySlugOrId } from '@/hooks/usePageFetchers';

export interface SimilarPersonality {
  id: string;
  slug?: string | null;
  name: string;
  profession: string | null;
  nationality: string | null;
  image_url: string | null;
  is_living: boolean;
  birth_date: string | null;
  death_date: string | null;
  description: string | null;
  similarity: number;
}

// eslint-disable-next-line react-refresh/only-export-components
export function transformPersonality(data: Record<string, unknown>): Personality {
  return {
    ...(data as unknown as Personality),
    fields: Array.isArray(data.fields) ? (data.fields as string[]) : [],
    achievements: Array.isArray(data.achievements) ? (data.achievements as string[]) : [],
    social_links: (data.social_links as Record<string, unknown>) || {},
    tags: (data.tags as string[]) || [],
    verification_status:
      (data.verification_status as 'pending' | 'verified' | 'disputed') || 'pending',
    visibility: (data.visibility as 'public' | 'private' | 'draft') || 'public',
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export async function fetchPersonalityBySlug(slug: string): Promise<Personality | null> {
  const data = await fetchPublicPersonalityBySlugOrId<Record<string, unknown>>(slug);
  if (!data) return null;
  return transformPersonality(data);
}

// eslint-disable-next-line react-refresh/only-export-components
export function calculateAge(birthDate: string, deathDate?: string) {
  const birth = new Date(birthDate);
  const end = deathDate ? new Date(deathDate) : new Date();
  const age = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
    return age - 1;
  }
  return age;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getInitials(name: string) {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function VerificationBadge({ status }: { status: Personality['verification_status'] }) {
  if (status === 'verified') {
    return (
      <Badge
        variant="secondary"
        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
      >
        <Verified style={{ height: 12, width: 12 }} />
        Verified
      </Badge>
    );
  }
  if (status === 'disputed') {
    return (
      <Badge
        variant="secondary"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          backgroundColor: '#fef9e7',
          color: '#a16207',
        }}
      >
        Disputed
      </Badge>
    );
  }
  return null;
}

interface PersonalityHeroProps {
  personality: Personality;
  countryId: string | null;
  onShare: () => void;
  onProfessionClick: (profession: string) => void;
}

export function PersonalityHero({
  personality,
  countryId,
  onShare,
  onProfessionClick,
}: PersonalityHeroProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
      <div className="flex items-start gap-4">
        <Avatar style={{ height: 96, width: 96 }}>
          <AvatarImage
            src={personality.image_url || ''}
            alt={personality.name}
            style={{ objectFit: 'cover' }}
          />
          <AvatarFallback style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            {getInitials(personality.name)}
          </AvatarFallback>
        </Avatar>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{personality.name}</h1>
            {personality.is_featured && (
              <Badge
                variant="secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <Star style={{ height: 12, width: 12 }} />
                Featured
              </Badge>
            )}
            <VerificationBadge status={personality.verification_status} />
          </div>

          {personality.pronouns && (
            <p className="text-muted-foreground mb-2">({personality.pronouns})</p>
          )}

          <div className="flex items-center gap-4 text-muted-foreground mb-3 flex-wrap">
            {personality.profession && (
              <a
                href={`/personalities?profession=${encodeURIComponent(personality.profession)}`}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  onProfessionClick(personality.profession!);
                }}
                className="flex items-center gap-1 cursor-pointer text-primary no-underline hover:underline"
              >
                <Briefcase style={{ height: 16, width: 16 }} />
                <span>{personality.profession}</span>
              </a>
            )}
            {personality.nationality &&
              (countryId ? (
                <LocalizedLink
                  to={`/country/${countryId}`}
                  className="flex items-center gap-1 text-primary no-underline hover:underline"
                >
                  <MapPin style={{ height: 16, width: 16 }} />
                  <span>{personality.nationality}</span>
                </LocalizedLink>
              ) : (
                <div className="flex items-center gap-1">
                  <MapPin style={{ height: 16, width: 16 }} />
                  <span>{personality.nationality}</span>
                </div>
              ))}
            <div className="flex items-center gap-1">
              {personality.is_living ? (
                <>
                  <Heart style={{ height: 16, width: 16, color: '#16a34a' }} />
                  <span>Living</span>
                </>
              ) : (
                <>
                  <Calendar style={{ height: 16, width: 16 }} />
                  <span>Historical</span>
                </>
              )}
            </div>
          </div>

          {personality.birth_date && (
            <p className="text-sm text-muted-foreground mb-3">
              Age: {calculateAge(personality.birth_date, personality.death_date || undefined)}
              {personality.is_living ? ' years old' : ' years'}
            </p>
          )}

          {personality.fields.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {personality.fields.map((field, index) => (
                <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                  {field}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ReportButton
          contentType="personalities"
          contentId={personality.id}
          contentName={personality.name}
        />
        <AdminEditButton
          contentType="personalities"
          contentId={personality.id}
          contentName={personality.name}
          currentData={personality as unknown as Record<string, unknown>}
          onSaved={() => window.location.reload()}
        />
        <Button variant="outline" size="sm" onClick={onShare}>
          <Share2 style={{ height: 16, width: 16, marginRight: 8 }} />
          Share
        </Button>
        {personality.website_url && (
          <Button variant="outline" size="sm" asChild>
            <a href={personality.website_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink style={{ height: 16, width: 16, marginRight: 8 }} />
              Website
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export function PersonalityOverview({
  personality,
  similarPersonalities,
}: {
  personality: Personality;
  similarPersonalities: SimilarPersonality[];
}) {
  return (
    <div className="flex flex-col gap-6 mt-4">
      {personality.description && (
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <p style={{ color: 'hsl(var(--muted-foreground))' }}>{personality.description}</p>
          </CardContent>
        </Card>
      )}

      {personality.bio && (
        <Card>
          <CardHeader>
            <CardTitle>Biography</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {personality.bio.split('\n').map(
                (paragraph, index) =>
                  paragraph.trim() && (
                    <p key={index} style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {paragraph}
                    </p>
                  ),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {personality.achievements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Notable Achievements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {personality.achievements.map((achievement, index) => (
                <li key={index} className="flex items-start gap-2">
                  <div
                    className="bg-primary rounded-full mt-2 flex-shrink-0"
                    style={{ height: 8, width: 8 }}
                  />
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>{achievement}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {similarPersonalities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Similar Personalities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {similarPersonalities.map((similar) => (
                <LocalizedLink
                  key={similar.id}
                  to={`/personalities/${similar.slug || similar.id}`}
                  className="flex items-center gap-3 p-3 rounded no-underline text-inherit transition-all hover:bg-muted"
                >
                  <Avatar style={{ height: 40, width: 40, flexShrink: 0 }}>
                    <AvatarImage
                      src={similar.image_url || ''}
                      alt={similar.name}
                      style={{ objectFit: 'cover' }}
                    />
                    <AvatarFallback style={{ fontSize: '0.75rem' }}>
                      {getInitials(similar.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p
                      className="font-semibold text-sm"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {similar.name}
                    </p>
                    {similar.profession && (
                      <p
                        className="text-xs text-muted-foreground"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {similar.profession}
                      </p>
                    )}
                  </div>
                </LocalizedLink>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function PersonalitySidebar({
  personality,
  countryId,
  onTagClick,
}: {
  personality: Personality;
  countryId: string | null;
  onTagClick: (tag: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {personality.birth_date && (
            <div className="flex items-center gap-3">
              <Calendar style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
              <div>
                <p className="text-sm text-muted-foreground">Born</p>
                <p className="font-medium">
                  {new Date(personality.birth_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
          {personality.death_date && (
            <div className="flex items-center gap-3">
              <Calendar style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
              <div>
                <p className="text-sm text-muted-foreground">Died</p>
                <p className="font-medium">
                  {new Date(personality.death_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
          {personality.nationality && (
            <div className="flex items-center gap-3">
              <MapPin style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
              <div>
                <p className="text-sm text-muted-foreground">Nationality</p>
                {countryId ? (
                  <LocalizedLink
                    to={`/country/${countryId}`}
                    className="font-medium text-primary no-underline hover:underline"
                  >
                    {personality.nationality}
                  </LocalizedLink>
                ) : (
                  <p className="font-medium">{personality.nationality}</p>
                )}
              </div>
            </div>
          )}
          {personality.profession && (
            <div className="flex items-center gap-3">
              <Briefcase style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
              <div>
                <p className="text-sm text-muted-foreground">Profession</p>
                <LocalizedLink
                  to={`/personalities?profession=${encodeURIComponent(personality.profession)}`}
                  className="font-medium text-primary no-underline hover:underline"
                >
                  {personality.profession}
                </LocalizedLink>
              </div>
            </div>
          )}
          {personality.birth_place && (
            <div className="flex items-center gap-3">
              <MapPin style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
              <div>
                <p className="text-sm text-muted-foreground">Birth Place</p>
                <p className="font-medium">{personality.birth_place}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {personality.social_links && Object.keys(personality.social_links).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Social Links</CardTitle>
          </CardHeader>
          <CardContent>
            <SocialLinksDisplay socialLinks={personality.social_links} size="sm" />
          </CardContent>
        </Card>
      )}

      {personality.tags && personality.tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Tag style={{ height: 16, width: 16 }} />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {personality.tags.map((tag, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  style={{ fontSize: '0.75rem', cursor: 'pointer' }}
                  onClick={() => onTagClick(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
