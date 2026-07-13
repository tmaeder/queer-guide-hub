import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { formatProfession } from '@/lib/professionDisplay';
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
import { TagChipRow } from '@/components/tags/TagChipRow';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Editable } from '@/components/admin/inline/Editable';
import { SocialCards } from '@/components/social/SocialCard';
import type { Personality } from '@/hooks/usePersonalities';
import { fetchPublicPersonalityBySlugOrId } from '@/hooks/usePageFetchers';
import { formatPersonDateRange, isoDateAttr } from '@/lib/personDate';
import { usePersonalityRelated } from '@/hooks/usePersonalityRelated';
import { useTranslation } from 'react-i18next';
import {
  resolveHistoricalPlace,
  type HistoricalNameEntry,
} from '@/lib/historicalPlace';
import { codeToFlagEmoji } from '@/lib/countryFlag';
import { resolvePublisherName } from '@/lib/publisherName';

export interface PersonalityBirthCity {
  id: string;
  name: string | null;
  name_de?: string | null;
  name_en?: string | null;
  historical_names?: HistoricalNameEntry[] | null;
  country?: { code?: string | null; name: string | null; flag_emoji?: string | null } | null;
}

export interface PersonalityDeathCity {
  id: string;
  name: string | null;
  name_de?: string | null;
  name_en?: string | null;
  country?: { code?: string | null; name: string | null; flag_emoji?: string | null } | null;
}

export type PersonalityWithBirthCity = Personality & {
  birth_city?: PersonalityBirthCity | null;
  death_city?: PersonalityDeathCity | null;
};


// Imports may write structured objects into fields/achievements (e.g.
// {"parties": [...]}, {"type": "award_detail", "text": "..."}). The detail
// page renders plain strings, so keep strings and unwrap a string `text`
// property; drop everything else instead of crashing React.
function toRenderableStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (entry && typeof entry === 'object') {
      const text = (entry as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim()) return [text];
    }
    return [];
  });
}

export function transformPersonality(data: Record<string, unknown>): PersonalityWithBirthCity {
  const birthCity = (data.birth_city ?? null) as PersonalityBirthCity | null;
  const deathCity = (data.death_city ?? null) as PersonalityDeathCity | null;
  return {
    ...(data as unknown as Personality),
    fields: toRenderableStrings(data.fields),
    achievements: toRenderableStrings(data.achievements),
    social_links: (data.social_links as Record<string, unknown>) || {},
    tags: (data.tags as string[]) || [],
    verification_status:
      (data.verification_status as 'pending' | 'verified' | 'disputed') || 'pending',
    visibility: (data.visibility as 'public' | 'private' | 'draft') || 'public',
    birth_city: birthCity,
    death_city: deathCity,
  };
}

export async function fetchPersonalityBySlug(
  slug: string,
): Promise<PersonalityWithBirthCity | null> {
  const data = await fetchPublicPersonalityBySlugOrId<Record<string, unknown>>(slug);
  if (!data) return null;
  return transformPersonality(data);
}

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

// Admin-curated cause-of-death slugs (see config/contentTypes/personality.ts)
// → public display labels. Unknown/other stay hidden — no speculation.
const CAUSE_OF_DEATH_LABELS: Record<string, string> = {
  natural: 'Natural causes',
  illness: 'Illness',
  hiv_aids: 'HIV/AIDS-related illness',
  suicide: 'Suicide',
  homicide: 'Homicide',
  accident: 'Accident',
  overdose: 'Overdose',
  execution: 'Execution',
};

export function causeOfDeathLabel(cause?: string | null): string | null {
  if (!cause) return null;
  return CAUSE_OF_DEATH_LABELS[cause] ?? null;
}

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
      <Badge variant="secondary" style={{ alignItems: 'center', gap: '0.25rem' }} className="flex">
        <Verified size={12} />
        Verified
      </Badge>
    );
  }
  if (status === 'disputed') {
    return (
      <Badge
        variant="secondary"
        style={{ alignItems: 'center', gap: '0.25rem', backgroundColor: 'hsl(var(--muted))' }}
        className="flex text-muted-foreground"
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
  onContentUpdated?: () => void;
}

export function PersonalityHero({
  personality,
  countryId,
  onShare,
  onProfessionClick,
  onContentUpdated,
}: PersonalityHeroProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
      <div className="flex items-start gap-4">
        <Avatar style={{ height: 96, width: 96 }}>
          <AvatarImage
            src={personality.image_url || ''}
            alt={personality.name}
            referrerPolicy="no-referrer"
            style={{ objectFit: 'cover', objectPosition: 'top' }}
          />
          <AvatarFallback className="text-xl font-semibold">
            {getInitials(personality.name)}
          </AvatarFallback>
        </Avatar>

        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold">
              <Editable
                contentType="personalities"
                recordId={personality.id}
                field="name"
                value={personality.name}
                onSaved={onContentUpdated}
              >
                {personality.name}
              </Editable>
            </h1>
            {personality.is_featured && (
              <Badge
                variant="secondary"
                style={{ alignItems: 'center', gap: '0.25rem' }}
                className="flex"
              >
                <Star size={12} />
                Featured
              </Badge>
            )}
            <VerificationBadge status={personality.verification_status} />
          </div>

          {personality.pronouns && (
            <p className="text-muted-foreground mb-2">({personality.pronouns})</p>
          )}

          <div className="flex items-center gap-4 text-muted-foreground mb-4 flex-wrap">
            {personality.profession && (
              <a
                href={`/personalities?profession=${encodeURIComponent(personality.profession)}`}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  onProfessionClick(personality.profession!);
                }}
                className="flex items-center gap-1 cursor-pointer text-primary no-underline hover:underline"
              >
                <Briefcase size={16} />
                <span>{formatProfession(personality.profession)}</span>
              </a>
            )}
            {personality.nationality &&
              (countryId ? (
                <LocalizedLink
                  to={`/country/${countryId}`}
                  className="flex items-center gap-1 text-primary no-underline hover:underline"
                >
                  <MapPin size={16} />
                  <span>{personality.nationality}</span>
                </LocalizedLink>
              ) : (
                <div className="flex items-center gap-1">
                  <MapPin size={16} />
                  <span>{personality.nationality}</span>
                </div>
              ))}
            <div className="flex items-center gap-1">
              {personality.is_living ? (
                <>
                  <Heart size={16} />
                  <span>Living</span>
                </>
              ) : (
                <>
                  <Calendar size={16} />
                  <span>Historical</span>
                </>
              )}
            </div>
          </div>

          {personality.birth_date && (
            <p className="text-sm text-muted-foreground mb-4">
              Age: {calculateAge(personality.birth_date, personality.death_date || undefined)}
              {personality.is_living ? ' years old' : ' years'}
            </p>
          )}

          {personality.fields.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {personality.fields.map((field, index) => (
                <Badge key={index} variant="outline" className="text-xs">
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
          <Share2 size={16} className="mr-2" />
          Share
        </Button>
        {personality.website_url && (
          <Button variant="outline" size="sm" asChild>
            <a href={personality.website_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} className="mr-2" />
              Website
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function RelatedContent({ personality }: { personality: Personality }) {
  const { t } = useTranslation();
  const { news, events, loading } = usePersonalityRelated(personality.name, personality.slug);

  if (loading) return null;
  if (news.length === 0 && events.length === 0) return null;

  return (
    <>
      {news.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('pages.personalities.detail.inTheNews', 'In the news')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {news.map((n) => (
                <li key={n.id}>
                  <LocalizedLink
                    to={`/news/${n.slug}`}
                    className="flex items-start gap-4 py-4 no-underline text-inherit hover:bg-accent transition-colors -mx-2 px-2 rounded"
                  >
                    {n.image_url && (
                      <img
                        src={n.image_url}
                        alt=""
                        loading="lazy"
                        className="w-16 h-16 rounded-element object-cover flex-shrink-0 bg-muted"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium line-clamp-2">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {resolvePublisherName({ publisherName: n.publisher_name })
                          ? `${resolvePublisherName({ publisherName: n.publisher_name })} · `
                          : ''}
                        <time dateTime={n.published_at}>
                          {new Date(n.published_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </time>
                      </p>
                    </div>
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('pages.personalities.detail.relatedEvents', 'Related events')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {events.map((e) => (
                <li key={e.id}>
                  <LocalizedLink
                    to={`/events/${e.slug ?? e.id}`}
                    className="flex items-start gap-4 p-2 rounded no-underline text-inherit hover:bg-accent transition-colors"
                  >
                    {e.image_url && (
                      <img
                        src={e.image_url}
                        alt=""
                        loading="lazy"
                        className="w-14 h-14 rounded-element object-cover flex-shrink-0 bg-muted"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium line-clamp-2">{e.title}</p>
                      {e.start_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <time dateTime={e.start_date}>
                            {new Date(e.start_date).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </time>
                        </p>
                      )}
                    </div>
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

export function PersonalityOverview({
  personality,
  onContentUpdated,
}: {
  personality: Personality;
  onContentUpdated?: () => void;
}) {
  return (
    <ScrollReveal direction="up">
      <div className="flex flex-col gap-6 mt-4">
        {/* The short `description` is a Wikidata-style one-liner (e.g. "Canadian actor
            (born 1987)") that duplicates the profession, nationality and birth year already
            shown in the hero and sidebar. Only surface it as a standalone card when there is
            no richer `bio` to supersede it. */}
        {personality.description && !personality.bio && (
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent>
              <Editable
                contentType="personalities"
                recordId={personality.id}
                field="description"
                value={personality.description}
                onSaved={onContentUpdated}
                fieldOverride={{ type: 'textarea' }}
                as="div"
              >
                <p className="text-muted-foreground">{personality.description}</p>
              </Editable>
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
                      <p key={index} className="text-muted-foreground">
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
                    <span className="text-muted-foreground">{achievement}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <RelatedContent personality={personality} />
        {/* "Similar Personalities" renders once, via <SimilarItems> in
            PersonalityDetail (discovery engine, public-indexed source). The old
            get_similar_personalities card was a second, unfiltered surface that
            surfaced duplicates + off-topic matches — removed. */}
      </div>
    </ScrollReveal>
  );
}

export function PersonalitySidebar({
  personality,
}: {
  personality: Personality;
}) {
  return (
    <ScrollReveal direction="up">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent style={{ flexDirection: 'column', gap: '0.75rem' }} className="flex">
            {(() => {
              const range = formatPersonDateRange(
                personality.birth_date,
                personality.death_date,
              );
              return (
                <>
                  {personality.birth_date && (
                    <div className="flex items-center gap-4">
                      <Calendar size={16} className="text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Born</p>
                        <p className="font-medium">
                          <time dateTime={isoDateAttr(personality.birth_date) ?? undefined}>
                            {range.birth ?? personality.birth_date}
                          </time>
                        </p>
                      </div>
                    </div>
                  )}
                  {personality.death_date && (
                    <div className="flex items-center gap-4">
                      <Calendar size={16} className="text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Died</p>
                        <p className="font-medium">
                          <time dateTime={isoDateAttr(personality.death_date) ?? undefined}>
                            {range.death ?? personality.death_date}
                          </time>
                        </p>
                        {causeOfDeathLabel(personality.cause_of_death) && (
                          <p className="text-xs text-muted-foreground">
                            {causeOfDeathLabel(personality.cause_of_death)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
            {/* Nationality and Profession are intentionally omitted here — both are shown
                prominently in the hero. Repeating them in this fact box was the source of the
                "actor three times / Canada twice" redundancy. The sidebar keeps only the
                date/place facts the hero doesn't carry. */}
            {personality.birth_place && (() => {
              const p = personality as PersonalityWithBirthCity;
              const city = p.birth_city ?? null;
              const flag = city?.country?.flag_emoji ?? codeToFlagEmoji(city?.country?.code);
              const resolved = resolveHistoricalPlace({
                historicalNames: city?.historical_names ?? [],
                rawPlace: p.birth_place ?? null,
                birthDate: p.birth_date ?? null,
                currentName: city?.name ?? null,
                currentNameDe: city?.name_de ?? null,
                currentNameEn: city?.name_en ?? null,
                currentCountry: city?.country?.name ?? null,
                locale: 'de',
              });
              // Drop the country suffix when it just repeats the nationality already shown in
              // the hero (e.g. nationality "Canada" + birth place "Halifax, Canada").
              const countryMatchesNationality =
                resolved.country &&
                personality.nationality &&
                resolved.country.trim().toLowerCase() ===
                  personality.nationality.trim().toLowerCase();
              const display =
                resolved.country && !countryMatchesNationality
                  ? `${resolved.name ?? p.birth_place}, ${resolved.country}`
                  : (resolved.name ?? p.birth_place);
              const today =
                resolved.historical && city?.name
                  ? `heute ${city.name}${city.country?.name ? ', ' + city.country.name : ''}`
                  : null;
              return (
                <div className="flex items-center gap-4">
                  <MapPin size={16} className="text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Birth Place</p>
                    <p className="font-medium">
                      {flag && !resolved.historical && (
                        <span aria-hidden="true" className="mr-2">{flag}</span>
                      )}
                      {display}
                    </p>
                    {today && (
                      <p className="text-xs text-muted-foreground">
                        {flag && (
                          <span aria-hidden="true" className="mr-2">{flag}</span>
                        )}
                        {today}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
            {personality.death_place && (() => {
              const p = personality as PersonalityWithBirthCity;
              const city = p.death_city ?? null;
              const flag = city?.country?.flag_emoji ?? codeToFlagEmoji(city?.country?.code);
              const country = city?.country?.name ?? null;
              const display = country
                ? `${p.death_place}, ${country}`
                : p.death_place;
              return (
                <div className="flex items-center gap-4">
                  <MapPin size={16} className="text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Death Place</p>
                    <p className="font-medium">
                      {flag && (
                        <span aria-hidden="true" className="mr-2">{flag}</span>
                      )}
                      {display}
                    </p>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {personality.social_links && Object.keys(personality.social_links).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Social Links</CardTitle>
            </CardHeader>
            <CardContent>
              <SocialCards links={personality.social_links} />
            </CardContent>
          </Card>
        )}

        {personality.tags && personality.tags.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle style={{ alignItems: 'center', gap: '0.5rem' }} className="flex">
                <Tag size={16} />
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TagChipRow tags={personality.tags} more="expand" />
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollReveal>
  );
}
