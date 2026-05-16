import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardImage } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Newspaper,
  Calendar,
  Users as UsersIcon,
  Star,
  ExternalLink,
} from 'lucide-react';
import { useTagContent, TagContentResult } from '@/hooks/useTagContent';
import { formatDistanceToNow } from 'date-fns';

interface TagLinkedContentProps {
  tagId: string;
  tagName: string;
}

// ── Venue Card ──────────────────────────────────────────────────────

function VenueCard({ v, onClick }: { v: TagContentResult['venues'][number]; onClick: () => void }) {
  return (
    <Card hoverable style={{ overflow: 'hidden' }} onClick={onClick}>
      <CardImage src={v.image_url} alt={v.name} fallbackIcon={MapPin} height={160}>
        {v.foursquare_rating && (
          <div
            className="absolute flex items-center gap-1 text-white rounded-element px-1.5 py-0.5"
            style={{
              top: 8,
              right: 8,
              backgroundColor: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <Star style={{ width: 12, height: 12, fill: '#f59e0b', color: '#f59e0b' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, lineHeight: 1 }}>
              {(v.foursquare_rating / 10).toFixed(1)}
            </span>
          </div>
        )}
      </CardImage>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold leading-tight">
            {v.name}
          </p>
          {v.category && (
            <Badge variant="secondary">
              {v.category}
            </Badge>
          )}
        </div>
        {(v.city || v.country) && (
          <div className="flex items-center gap-1.5 text-muted-foreground mt-2">
            <MapPin style={{ width: 14, height: 14, flexShrink: 0 }} />
            <p className="text-sm">
              {[v.city, v.country].filter(Boolean).join(', ')}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Event Card ──────────────────────────────────────────────────────

function EventCard({ e, onClick }: { e: TagContentResult['events'][number]; onClick: () => void }) {
  const date = e.start_date ? new Date(e.start_date) : null;
  const month = date?.toLocaleDateString(undefined, { month: 'short' });
  const day = date?.getDate();

  return (
    <Card hoverable style={{ overflow: 'hidden' }} onClick={onClick}>
      <CardImage src={e.image_url} alt={e.title} fallbackIcon={Calendar} height={140}>
        {e.event_type && (
          <div
            className="absolute text-white rounded-element px-2 py-0.5 capitalize"
            style={{
              top: 8,
              left: 8,
              backgroundColor: 'rgba(0,0,0,0.65)',
              fontSize: '0.7rem',
              fontWeight: 600,
              backdropFilter: 'blur(4px)',
            }}
          >
            {e.event_type}
          </div>
        )}
      </CardImage>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {date && (
            <div
              className="rounded-element bg-muted flex flex-col items-center justify-center py-1.5 flex-shrink-0"
              style={{ width: 48 }}
            >
              <span className="uppercase" style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--primary))', lineHeight: 1 }}>
                {month}
              </span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.2 }}>
                {day}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p
              className="text-base font-semibold leading-tight"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {e.title}
            </p>
            {(e.city || e.venue_name) && (
              <p className="text-sm text-muted-foreground mt-1">
                {[e.venue_name, e.city].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── News Card ───────────────────────────────────────────────────────

function NewsCard({ n, onClick }: { n: TagContentResult['news'][number]; onClick: () => void }) {
  return (
    <Card hoverable style={{ overflow: 'hidden' }} onClick={onClick}>
      <CardImage src={n.image_url} alt={n.title} fallbackIcon={Newspaper} height={140} />
      <div className="p-4">
        <p
          className="text-base font-semibold"
          style={{
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {n.title}
        </p>
        {n.excerpt && (
          <p
            className="text-sm text-muted-foreground mt-1.5"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.5,
            }}
          >
            {n.excerpt}
          </p>
        )}
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">
            {n.news_sources?.name}
            {n.news_sources?.name && n.published_at && ' · '}
            {n.published_at && formatDistanceToNow(new Date(n.published_at), { addSuffix: true })}
          </span>
          {n.url && <ExternalLink style={{ width: 14, height: 14, opacity: 0.3, flexShrink: 0 }} />}
        </div>
      </div>
    </Card>
  );
}

// ── Personality Card ────────────────────────────────────────────────

function PersonalityCard({ p, onClick }: { p: TagContentResult['personalities'][number]; onClick: () => void }) {
  const initials = p.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Card hoverable style={{ overflow: 'hidden' }} onClick={onClick}>
      <div
        className="relative bg-muted overflow-hidden"
        style={{ paddingTop: '133.33%' }}
      >
        {p.image_url ? (
          <img
            src={p.image_url}
            alt={p.name}
            role="presentation"
            loading="lazy"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(219,39,119,0.18) 0%, rgba(245,158,11,0.18) 100%)',
            }}
          >
            <div
              className="rounded-full bg-background flex items-center justify-center"
              style={{ width: 64, height: 64 }}
            >
              <span className="text-muted-foreground" style={{ fontWeight: 700, fontSize: '1.25rem' }}>
                {initials}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="p-3">
        <p
          className="font-semibold truncate"
          style={{ fontSize: '0.9rem', lineHeight: 1.3 }}
        >
          {p.name}
        </p>
        {p.profession && (
          <p className="text-sm text-muted-foreground truncate">
            {p.profession}
          </p>
        )}
      </div>
    </Card>
  );
}

// ── Group Card ──────────────────────────────────────────────────────

function GroupCard({ g, onClick }: { g: TagContentResult['groups'][number]; onClick: () => void }) {
  return (
    <Card hoverable style={{ overflow: 'hidden' }} onClick={onClick}>
      <div className="p-4 flex items-center gap-4">
        {g.avatar_url ? (
          <img
            src={g.avatar_url}
            alt={g.name}
            role="presentation"
            style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            className="bg-muted flex items-center justify-center flex-shrink-0"
            style={{ width: 48, height: 48, borderRadius: 8 }}
          >
            <UsersIcon style={{ width: 20, height: 20, opacity: 0.3 }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate" style={{ fontSize: '0.95rem' }}>
            {g.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {g.member_count != null && `${g.member_count} members`}
            {g.member_count != null && g.privacy && ' · '}
            {g.privacy}
          </p>
        </div>
      </div>
    </Card>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="font-bold" style={{ fontSize: '1.1rem' }}>
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {count}
        </p>
      </div>
      {children}
    </div>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────

function CardSkeleton({ height = 260 }: { height?: number }) {
  return <Skeleton style={{ height, borderRadius: 12 }} />;
}

function SectionSkeleton() {
  return (
    <div>
      <Skeleton style={{ width: 120, height: 28, marginBottom: 16 }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

const MAX_NEWS = 6;

/**
 * P2-8 — rank news by relevance to the tag. Articles whose title or excerpt
 * mention the tag name sort first; others are demoted. This is a lightweight
 * client-side heuristic until the ingestion pipeline gets a confidence score.
 */
function rankNewsByRelevance(
  articles: TagContentResult['news'],
  tagName: string,
): TagContentResult['news'] {
  if (articles.length === 0) return articles;
  const terms = tagName.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return articles;

  return [...articles].sort((a, b) => {
    const textA = `${a.title ?? ''} ${a.excerpt ?? ''}`.toLowerCase();
    const textB = `${b.title ?? ''} ${b.excerpt ?? ''}`.toLowerCase();
    const scoreA = terms.filter((t) => textA.includes(t)).length;
    const scoreB = terms.filter((t) => textB.includes(t)).length;
    // Higher mention count first; preserve original order (by published_at) within same score
    return scoreB - scoreA;
  });
}

export function TagLinkedContent({ tagId, tagName }: TagLinkedContentProps) {
  const navigate = useLocalizedNavigate();
  const { data, isLoading } = useTagContent(tagId, tagName);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-10">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    );
  }

  if (!data) return null;

  const { venues, events, personalities, groups } = data;
  const news = rankNewsByRelevance(data.news, tagName);
  const hasAny = venues.length > 0 || news.length > 0 || events.length > 0 || personalities.length > 0 || groups.length > 0;
  if (!hasAny) return null;

  return (
    <div className="flex flex-col gap-10 min-w-0">
      {/* Venues */}
      {venues.length > 0 && (
        <Section title="Venues" count={venues.length}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {venues.map((v) => (
              <VenueCard key={v.id} v={v} onClick={() => navigate(`/venues/${v.slug || v.id}`)} />
            ))}
          </div>
        </Section>
      )}

      {/* Events */}
      {events.length > 0 && (
        <Section title="Events" count={events.length}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {events.map((e) => (
              <EventCard key={e.id} e={e} onClick={() => navigate(`/events/${e.slug || e.id}`)} />
            ))}
          </div>
        </Section>
      )}

      {/* Personalities */}
      {personalities.length > 0 && (
        <Section title="Personalities" count={personalities.length}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {personalities.map((p) => (
              <PersonalityCard key={p.id} p={p} onClick={() => navigate(`/personalities/${p.slug || p.id}`)} />
            ))}
          </div>
        </Section>
      )}

      {/* News */}
      {news.length > 0 && (
        <Section title="News" count={news.length}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {news.slice(0, MAX_NEWS).map((n) => (
              <NewsCard
                key={n.id}
                n={n}
                onClick={() => { if (n.url) window.open(n.url, '_blank', 'noopener'); }}
              />
            ))}
          </div>
          {news.length > MAX_NEWS && (
            <p className="text-sm text-muted-foreground mt-3 text-center">
              +{news.length - MAX_NEWS} more articles
            </p>
          )}
        </Section>
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <Section title="Communities" count={groups.length}>
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <GroupCard key={g.id} g={g} onClick={() => navigate(`/groups/${g.id}`)} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
