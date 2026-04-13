import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Card, CardImage } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Newspaper,
  Calendar,
  Users as UsersIcon,
  User,
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
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              bgcolor: 'rgba(0,0,0,0.65)',
              color: '#fff',
              borderRadius: 1.5,
              px: 0.75,
              py: 0.25,
              backdropFilter: 'blur(4px)',
            }}
          >
            <Star style={{ width: 12, height: 12, fill: '#f59e0b', color: '#f59e0b' }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, lineHeight: 1 }}>
              {(v.foursquare_rating / 10).toFixed(1)}
            </Typography>
          </Box>
        )}
      </CardImage>
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            {v.name}
          </Typography>
          {v.category && (
            <Badge variant="secondary" sx={{ fontSize: '0.75rem', flexShrink: 0 }}>
              {v.category}
            </Badge>
          )}
        </Box>
        {(v.city || v.country) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary', mt: 1 }}>
            <MapPin style={{ width: 14, height: 14, flexShrink: 0 }} />
            <Typography variant="body2">
              {[v.city, v.country].filter(Boolean).join(', ')}
            </Typography>
          </Box>
        )}
      </Box>
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
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              bgcolor: 'rgba(0,0,0,0.65)',
              color: '#fff',
              borderRadius: 1.5,
              px: 1,
              py: 0.25,
              fontSize: '0.7rem',
              fontWeight: 600,
              backdropFilter: 'blur(4px)',
              textTransform: 'capitalize',
            }}
          >
            {e.event_type}
          </Box>
        )}
      </CardImage>
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          {date && (
            <Box
              sx={{
                width: 48,
                borderRadius: 1.5,
                bgcolor: 'action.hover',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 0.75,
                flexShrink: 0,
              }}
            >
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: 'primary.main', lineHeight: 1 }}>
                {month}
              </Typography>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.2 }}>
                {day}
              </Typography>
            </Box>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                lineHeight: 1.2,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {e.title}
            </Typography>
            {(e.city || e.venue_name) && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {[e.venue_name, e.city].filter(Boolean).join(' \u00b7 ')}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Card>
  );
}

// ── News Card ───────────────────────────────────────────────────────

function NewsCard({ n, onClick }: { n: TagContentResult['news'][number]; onClick: () => void }) {
  return (
    <Card hoverable style={{ overflow: 'hidden' }} onClick={onClick}>
      <CardImage src={n.image_url} alt={n.title} fallbackIcon={Newspaper} height={140} />
      <Box sx={{ p: 2 }}>
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {n.title}
        </Typography>
        {n.excerpt && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.75,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.5,
            }}
          >
            {n.excerpt}
          </Typography>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {n.news_sources?.name}
            {n.news_sources?.name && n.published_at && ' \u00b7 '}
            {n.published_at && formatDistanceToNow(new Date(n.published_at), { addSuffix: true })}
          </Typography>
          {n.url && <ExternalLink style={{ width: 14, height: 14, opacity: 0.3, flexShrink: 0 }} />}
        </Box>
      </Box>
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
      <Box
        sx={{
          position: 'relative',
          pt: '133.33%',
          bgcolor: 'action.hover',
          overflow: 'hidden',
        }}
      >
        {p.image_url ? (
          <Box
            component="img"
            src={p.image_url}
            alt={p.name}
            loading="lazy"
            sx={{
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
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(219,39,119,0.18) 0%, rgba(245,158,11,0.18) 100%)',
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'background.paper',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: 'text.secondary' }}>
                {initials}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
      <Box sx={{ p: 1.5 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.9rem',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {p.name}
        </Typography>
        {p.profession && (
          <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.profession}
          </Typography>
        )}
      </Box>
    </Card>
  );
}

// ── Group Card ──────────────────────────────────────────────────────

function GroupCard({ g, onClick }: { g: TagContentResult['groups'][number]; onClick: () => void }) {
  return (
    <Card hoverable style={{ overflow: 'hidden' }} onClick={onClick}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        {g.avatar_url ? (
          <Box
            component="img"
            src={g.avatar_url}
            alt={g.name}
            sx={{ width: 48, height: 48, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <UsersIcon style={{ width: 20, height: 20, opacity: 0.3 }} />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {g.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {g.member_count != null && `${g.member_count} members`}
            {g.member_count != null && g.privacy && ' \u00b7 '}
            {g.privacy}
          </Typography>
        </Box>
      </Box>
    </Card>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {count}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────

function CardSkeleton({ height = 260 }: { height?: number }) {
  return <Skeleton variant="rounded" height={height} sx={{ borderRadius: 3 }} />;
}

function SectionSkeleton() {
  return (
    <Box>
      <Skeleton variant="text" width={120} height={28} sx={{ mb: 2 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <CardSkeleton />
        <CardSkeleton />
      </Box>
    </Box>
  );
}

// ── Main component ──────────────────────────────────────────────────

const MAX_NEWS = 6;

export function TagLinkedContent({ tagId, tagName }: TagLinkedContentProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useTagContent(tagId, tagName);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <SectionSkeleton />
        <SectionSkeleton />
      </Box>
    );
  }

  if (!data) return null;

  const { venues, news, events, personalities, groups } = data;
  const hasAny = venues.length > 0 || news.length > 0 || events.length > 0 || personalities.length > 0 || groups.length > 0;
  if (!hasAny) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      {/* Venues */}
      {venues.length > 0 && (
        <Section title="Venues" count={venues.length}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {venues.map((v) => (
              <VenueCard key={v.id} v={v} onClick={() => navigate(`/venues/${v.slug || v.id}`)} />
            ))}
          </Box>
        </Section>
      )}

      {/* Events */}
      {events.length > 0 && (
        <Section title="Events" count={events.length}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {events.map((e) => (
              <EventCard key={e.id} e={e} onClick={() => navigate(`/events/${e.slug || e.id}`)} />
            ))}
          </Box>
        </Section>
      )}

      {/* Personalities */}
      {personalities.length > 0 && (
        <Section title="Personalities" count={personalities.length}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            {personalities.map((p) => (
              <PersonalityCard key={p.id} p={p} onClick={() => navigate(`/personalities/${p.slug || p.id}`)} />
            ))}
          </Box>
        </Section>
      )}

      {/* News */}
      {news.length > 0 && (
        <Section title="News" count={news.length}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {news.slice(0, MAX_NEWS).map((n) => (
              <NewsCard
                key={n.id}
                n={n}
                onClick={() => { if (n.url) window.open(n.url, '_blank', 'noopener'); }}
              />
            ))}
          </Box>
          {news.length > MAX_NEWS && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, textAlign: 'center' }}>
              +{news.length - MAX_NEWS} more articles
            </Typography>
          )}
        </Section>
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <Section title="Communities" count={groups.length}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {groups.map((g) => (
              <GroupCard key={g.id} g={g} onClick={() => navigate(`/groups/${g.id}`)} />
            ))}
          </Box>
        </Section>
      )}
    </Box>
  );
}
