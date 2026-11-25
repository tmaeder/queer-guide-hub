import { PersonalityText } from '@/components/personalities/PersonalityText';
import {
  publicConnection,
  CONNECTION_LABELS,
  type PersonalityEditorial,
} from '@/lib/personalityEditorial';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { personalityProfessionLabel } from '@/lib/professionDisplay';
import { calculateAge } from '@/lib/personAge';
import {
  ExternalLink,
  Calendar,
  MapPin,
  Briefcase,
  Star,
  Heart,
  Verified,
  Tag,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TagChipRow } from '@/components/tags/TagChipRow';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { ShareMenu } from '@/components/share/ShareMenu';
import { Editable } from '@/components/admin/inline/Editable';
import { SocialCards } from '@/components/social/SocialCard';
import type { Personality } from '@/hooks/usePersonalities';
import { fetchPublicPersonalityBySlugOrId } from '@/hooks/usePageFetchers';
import { formatPersonDateRange, isoDateAttr } from '@/lib/personDate';
import { usePersonalityRelated } from '@/hooks/usePersonalityRelated';
import { useTranslation } from 'react-i18next';
import { resolveHistoricalPlace, type HistoricalNameEntry } from '@/lib/historicalPlace';
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

// Canonical implementation lives in `@/lib/personAge` — re-exported here because
// this page's tests and callers already import it from this module.
export { calculateAge };

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
  const { t } = useTranslation();
  if (status === 'verified') {
    return (
      <Badge variant="secondary" style={{ alignItems: 'center', gap: '0.25rem' }} className="flex">
        <Verified size={12} />
        {t('pages.personalities.ui.verified', 'Verified')}
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
        {t('pages.personalities.ui.disputed', 'Disputed')}
      </Badge>
    );
  }
  return null;
}

interface PersonalityHeroProps {
  editorial?: PersonalityEditorial;
  personality: Personality;
  countryId: string | null;
  onProfessionClick: (profession: string) => void;
  onContentUpdated?: () => void;
}

export function PersonalityHero({
  personality,
  editorial,
  countryId,
  onProfessionClick,
  onContentUpdated,
}: PersonalityHeroProps) {
  const { t } = useTranslation();
  // Tätigkeit(en) — activity layer, separate from the single Beruf (profession).
  // Stored as slugs; `roles` may not be in the generated row type yet, so read
  // it defensively. Prettify slug → label for display.
  const roles = ((personality as { roles?: string[] | null }).roles ?? []).filter(Boolean);
  const prettyRole = (slug: string) =>
    slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const age = calculateAge(personality.birth_date, personality.death_date);
  // An age is only stated when it is a real one: age at death when the death
  // date is known, current age for the living. A historical figure with no
  // recorded death date has no age we can state — aging them against today is
  // what produced "434" on the professions pages.
  const ageLabel =
    age === null
      ? null
      : personality.death_date
        ? `Died aged ${age}`
        : personality.is_living === false
          ? null
          : `${age} years old`;
  const chip =
    'inline-flex items-center gap-1.5 rounded-element bg-card px-2.5 py-1 text-13 shadow-soft no-underline';

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        {/* Portrait as a station ring. `rounded-full` is the sanctioned circle. */}
        <Avatar className="size-32 shrink-0 border border-border-hairline shadow-soft md:size-44">
          <AvatarImage
            src={personality.image_url || ''}
            alt={personality.name}
            referrerPolicy="no-referrer"
            className="object-cover object-top"
          />
          <AvatarFallback className="font-display text-display">
            {getInitials(personality.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          {/* The masthead grammar from DetailMasthead: bullet, then status
              chips, then the Anton title. */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <RouteBullet type="personality" size={34} />
            {personality.is_featured && (
              <span className="inline-flex items-center gap-1 bg-muted rounded-element px-2 py-1 text-2xs font-bold uppercase tracking-label">
                <Star size={12} aria-hidden="true" />
                {t('pages.personalities.ui.featured', 'Featured')}
              </span>
            )}
            <VerificationBadge status={personality.verification_status} />
          </div>

          <h1 className="m-0 font-display text-headline leading-none tracking-tight md:text-display">
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
          {personality.pronouns && (
            <p className="mt-2 text-13 text-muted-foreground">{personality.pronouns}</p>
          )}

          {/* One row of facts, each a chip: what they do, where from, alive or
              not, and how old. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {personality.profession && (
              <a
                href={`/personalities?profession=${encodeURIComponent(personality.profession)}`}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  onProfessionClick(personality.profession!);
                }}
                className={`${chip} font-bold text-foreground hover:bg-foreground hover:text-background`}
              >
                <Briefcase size={14} aria-hidden />
                {personalityProfessionLabel(personality.profession, t)}
              </a>
            )}
            {roles.map((slug) => (
              <span key={slug} className={chip}>
                {personalityProfessionLabel(prettyRole(slug), t)}
              </span>
            ))}
            {personality.nationality &&
              (countryId ? (
                <LocalizedLink
                  to={`/country/${countryId}`}
                  className={`${chip} text-foreground hover:bg-foreground hover:text-background`}
                >
                  <MapPin size={14} aria-hidden />
                  {personality.nationality}
                </LocalizedLink>
              ) : (
                <span className={chip}>
                  <MapPin size={14} aria-hidden />
                  {personality.nationality}
                </span>
              ))}
            <span className={`${chip} text-muted-foreground`}>
              {personality.is_living ? (
                <Heart size={14} aria-hidden />
              ) : (
                <Calendar size={14} aria-hidden />
              )}
              {personality.is_living
                ? t('pages.personalities.ui.living', 'Living')
                : t('pages.personalities.ui.historical', 'Historical')}
              {ageLabel && <span className="tabular-nums">· {ageLabel}</span>}
            </span>
          </div>

          {personality.bio && (
            <PersonalityText
              value={personality.bio.trim().split('\n')[0]}
              field="bio"
              editorial={editorial}
              className="mt-4 max-w-reading text-15 leading-relaxed text-muted-foreground [&>p]:line-clamp-3"
            />
          )}

          {personality.fields.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
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
          exportable
        />
        <ShareMenu
          url={window.location.href}
          title={personality.name}
          text={personality.description || `Learn about ${personality.name}`}
          entity={{
            entity_table: 'personalities',
            entity_id: personality.id,
            title: personality.name,
            subtitle: personality.profession
              ? personalityProfessionLabel(personality.profession, t)
              : null,
            image_url: personality.image_url ?? null,
            path: `/personalities/${personality.slug ?? personality.id}`,
          }}
        />
        {personality.website_url && (
          <Button variant="outline" size="sm" asChild>
            <a href={personality.website_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} className="mr-2" />
              {t('pages.personalities.ui.website', 'Website')}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function RelatedContent({ personality }: { personality: Personality }) {
  const { t, i18n } = useTranslation();
  const { news, events, loading } = usePersonalityRelated(personality.id);

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
            <ul className="flex flex-col">
              {news.map((n) => (
                <li key={n.id}>
                  <LocalizedLink
                    to={`/news/${n.slug}`}
                    className="-mx-2 flex items-start gap-4 border-b border-border-hairline px-2 py-4 text-inherit no-underline transition-colors hover:bg-surface-container"
                  >
                    {n.image_url && (
                      <img
                        src={n.image_url}
                        alt=""
                        loading="lazy"
                        className="h-16 w-16 shrink-0 bg-muted object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-13 font-bold">{n.title}</p>
                      <p className="mt-1 text-2xs text-muted-foreground">
                        {resolvePublisherName({ publisherName: n.publisher_name })
                          ? `${resolvePublisherName({ publisherName: n.publisher_name })} · `
                          : ''}
                        <time dateTime={n.published_at}>
                          {new Date(n.published_at).toLocaleDateString(i18n.language || 'en', {
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
                    className="card-lift-sm flex items-start gap-4 bg-card p-2 text-inherit no-underline rounded-container shadow-soft"
                  >
                    {e.image_url && (
                      <img
                        src={e.image_url}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 shrink-0 bg-muted object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-13 font-bold">{e.title}</p>
                      {e.start_date && (
                        <p className="mt-1 text-2xs text-muted-foreground">
                          <time dateTime={e.start_date}>
                            {new Date(e.start_date).toLocaleDateString(i18n.language || 'en', {
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
  editorial,
  onContentUpdated,
}: {
  personality: Personality;
  editorial?: PersonalityEditorial;
  onContentUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const connection = publicConnection(editorial);
  return (
    <ScrollReveal direction="up">
      <div className="flex flex-col gap-6 mt-4">
        {connection && (
          <Card>
            <CardHeader>
              <CardTitle>
                {t('pages.personalities.ui.connectionTitle', 'LGBTIQ community connection')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {connection.category && (
                <p>
                  {t(
                    `pages.personalities.ui.${connection.category}`,
                    CONNECTION_LABELS[connection.category],
                  )}
                </p>
              )}
              {connection.details && (
                <PersonalityText
                  value={connection.details}
                  field="lgbti_details"
                  editorial={editorial}
                  className="text-muted-foreground"
                />
              )}
              <ul className="flex flex-col gap-1">
                {connection.sources.map((url, index) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-13 underline"
                    >
                      {t('pages.personalities.ui.source', 'Source')} {index + 1} ·{' '}
                      {new URL(url).hostname}
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* The short `description` is a Wikidata-style one-liner (e.g. "Canadian actor
            (born 1987)") that duplicates the profession, nationality and birth year already
            shown in the hero and sidebar. Only surface it as a standalone card when there is
            no richer `bio` to supersede it. */}
        {personality.description && !personality.bio && (
          <Card>
            <CardHeader>
              <CardTitle id="personality-biography" className="scroll-mt-24">
                {t('pages.personalities.ui.about', 'About')}
              </CardTitle>
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
                <div className="text-muted-foreground">
                  <PersonalityText
                    value={personality.description}
                    field="description"
                    editorial={editorial}
                    descriptionI18n={personality.description_i18n}
                  />
                </div>
              </Editable>
            </CardContent>
          </Card>
        )}

        {personality.bio && (
          <Card>
            <CardHeader>
              <CardTitle id="personality-biography" className="scroll-mt-24">
                {t('pages.personalities.ui.biography', 'Biography')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PersonalityText
                value={personality.bio}
                field="bio"
                editorial={editorial}
                className="text-muted-foreground leading-relaxed"
              />
            </CardContent>
          </Card>
        )}

        {personality.achievements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                {t('pages.personalities.ui.achievements', 'Notable Achievements')}
              </CardTitle>
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

export function PersonalitySidebar({ personality }: { personality: Personality }) {
  const { t, i18n } = useTranslation();
  return (
    <ScrollReveal direction="up">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {t('pages.personalities.ui.personalInformation', 'Personal Information')}
            </CardTitle>
          </CardHeader>
          <CardContent style={{ flexDirection: 'column', gap: '0.75rem' }} className="flex">
            {(() => {
              const range = formatPersonDateRange(
                personality.birth_date,
                personality.death_date,
                i18n.language || 'en',
              );
              return (
                <>
                  {personality.birth_date && (
                    <div className="flex items-center gap-4">
                      <Calendar size={16} className="text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t('pages.personalities.ui.born', 'Born')}
                        </p>
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
                        <p className="text-sm text-muted-foreground">
                          {t('pages.personalities.ui.died', 'Died')}
                        </p>
                        <p className="font-medium">
                          <time dateTime={isoDateAttr(personality.death_date) ?? undefined}>
                            {range.death ?? personality.death_date}
                          </time>
                        </p>
                        {causeOfDeathLabel(personality.cause_of_death) && (
                          <p className="text-xs text-muted-foreground">
                            {t(
                              `pages.personalities.causes.${personality.cause_of_death}`,
                              causeOfDeathLabel(personality.cause_of_death)!,
                            )}
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
            {personality.birth_place &&
              (() => {
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
                  locale: (i18n.language || 'en').startsWith('de') ? 'de' : 'en',
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
                    ? t('pages.personalities.ui.todayPlace', {
                        defaultValue: 'Today: {{place}}',
                        place: `${city.name}${city.country?.name ? ', ' + city.country.name : ''}`,
                      })
                    : null;
                return (
                  <div className="flex items-center gap-4">
                    <MapPin size={16} className="text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t('pages.personalities.ui.birthPlace', 'Birth Place')}
                      </p>
                      <p className="font-medium">
                        {flag && !resolved.historical && (
                          <span aria-hidden="true" className="mr-2">
                            {flag}
                          </span>
                        )}
                        {display}
                      </p>
                      {today && (
                        <p className="text-xs text-muted-foreground">
                          {flag && (
                            <span aria-hidden="true" className="mr-2">
                              {flag}
                            </span>
                          )}
                          {today}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            {personality.death_place &&
              (() => {
                const p = personality as PersonalityWithBirthCity;
                const city = p.death_city ?? null;
                const flag = city?.country?.flag_emoji ?? codeToFlagEmoji(city?.country?.code);
                const country = city?.country?.name ?? null;
                const display = country ? `${p.death_place}, ${country}` : p.death_place;
                return (
                  <div className="flex items-center gap-4">
                    <MapPin size={16} className="text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t('pages.personalities.ui.deathPlace', 'Death Place')}
                      </p>
                      <p className="font-medium">
                        {flag && (
                          <span aria-hidden="true" className="mr-2">
                            {flag}
                          </span>
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
              <CardTitle>{t('pages.personalities.ui.socialLinks', 'Social Links')}</CardTitle>
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
                {t('pages.personalities.ui.tags', 'Tags')}
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
