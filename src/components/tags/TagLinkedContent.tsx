import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Newspaper,
  Calendar,
  Users as UsersIcon,
  User,
  Star,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { useTagContent, TagContentResult } from '@/hooks/useTagContent';
import { formatDistanceToNow } from 'date-fns';

interface TagLinkedContentProps {
  tagId: string;
  tagName: string;
}

// ── Venue Card ───────────────────────────────────────────────────────

function VenueCard({ v, onClick }: { v: TagContentResult['venues'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 220,
        maxWidth: 260,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        overflow: 'hidden',
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        flexShrink: 0,
        transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: '0 8px 24px -8px rgba(0,0,0,0.12)',
          borderColor: 'primary.main',
        },
        '&:hover img': {
          transform: 'scale(1.05)',
        },
      }}
    >
      <Box sx={{ height: 140, overflow: 'hidden', position: 'relative', bgcolor: 'action.hover' }}>
        {v.image_url ? (
          <Box
            component="img"
            src={v.image_url}
            alt={v.name}
            loading="lazy"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin style={{ width: 28, height: 28, opacity: 0.15 }} />
          </Box>
        )}
        {v.foursquare_rating && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              bgcolor: 'rgba(0,0,0,0.65)',
              color: '#fff',
              borderRadius: 1.5,
              px: 0.75,
              py: 0.25,
              backdropFilter: 'blur(4px)',
            }}
          >
            <Star style={{ width: 11, height: 11, fill: '#f59e0b', color: '#f59e0b' }} />
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, lineHeight: 1 }}>
              {(v.foursquare_rating / 10).toFixed(1)}
            </Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ p: 1.5 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.875rem',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {v.name}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
            mt: 0.25,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <MapPin style={{ width: 11, height: 11, flexShrink: 0 }} />
          {[v.city, v.country].filter(Boolean).join(', ') || v.category || 'Venue'}
        </Typography>
      </Box>
    </Box>
  );
}

// ── News Card (featured large) ───────────────────────────────────────

function NewsCardFeatured({ n, onClick }: { n: TagContentResult['news'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        overflow: 'hidden',
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: '0 4px 16px -4px rgba(0,0,0,0.1)',
        },
        '&:hover img': {
          transform: 'scale(1.03)',
        },
      }}
    >
      {n.image_url && (
        <Box sx={{ height: 180, overflow: 'hidden', bgcolor: 'action.hover' }}>
          <Box
            component="img"
            src={n.image_url}
            alt={n.title}
            loading="lazy"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).parentElement!.style.display = 'none';
            }}
          />
        </Box>
      )}
      <Box sx={{ p: 2 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.95rem',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {n.title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1 }}>
          {n.news_sources?.name && (
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'primary.main' }}>
              {n.news_sources.name}
            </Typography>
          )}
          {n.published_at && (
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
              {formatDistanceToNow(new Date(n.published_at), { addSuffix: true })}
            </Typography>
          )}
          {n.url && <ExternalLink style={{ width: 11, height: 11, opacity: 0.3, marginLeft: 'auto' }} />}
        </Box>
      </Box>
    </Box>
  );
}

// ── News Card (compact) ──────────────────────────────────────────────

function NewsCardCompact({ n, onClick }: { n: TagContentResult['news'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        gap: 1.5,
        p: 1.25,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2.5,
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'action.hover',
        },
      }}
    >
      {n.image_url && (
        <Box
          component="img"
          src={n.image_url}
          alt=""
          loading="lazy"
          sx={{
            width: 72,
            height: 54,
            borderRadius: 1.5,
            objectFit: 'cover',
            flexShrink: 0,
          }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {n.title}
        </Typography>
        <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.25 }}>
          {n.news_sources?.name}
          {n.news_sources?.name && n.published_at && ' · '}
          {n.published_at && formatDistanceToNow(new Date(n.published_at), { addSuffix: true })}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Event Card ───────────────────────────────────────────────────────

function EventCard({ e, onClick }: { e: TagContentResult['events'][number]; onClick: () => void }) {
  const date = e.start_date ? new Date(e.start_date) : null;
  const month = date?.toLocaleDateString(undefined, { month: 'short' });
  const day = date?.getDate();

  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        gap: 1.5,
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2.5,
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'action.hover',
        },
      }}
    >
      {date ? (
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: 'action.hover',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: 'primary.main', lineHeight: 1 }}>
            {month}
          </Typography>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.1 }}>
            {day}
          </Typography>
        </Box>
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
          <Calendar style={{ width: 18, height: 18, opacity: 0.3 }} />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.875rem',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {e.title}
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
          {[e.city, e.country].filter(Boolean).join(', ')}
        </Typography>
      </Box>
      {e.event_type && (
        <Badge variant="secondary" style={{ fontSize: '0.6rem', textTransform: 'capitalize', alignSelf: 'center' }}>
          {e.event_type}
        </Badge>
      )}
    </Box>
  );
}

// ── Personality Card ─────────────────────────────────────────────────

function PersonalityCard({ p, onClick }: { p: TagContentResult['personalities'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.75,
        p: 1.5,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        borderRadius: 2.5,
        textAlign: 'center',
        width: 110,
        flexShrink: 0,
        transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        '&:hover': {
          bgcolor: 'action.hover',
        },
        '&:hover .personality-avatar': {
          transform: 'scale(1.08)',
          boxShadow: '0 4px 12px -2px rgba(219,39,119,0.3)',
        },
      }}
    >
      {p.image_url ? (
        <Box
          component="img"
          className="personality-avatar"
          src={p.image_url}
          alt={p.name}
          loading="lazy"
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            objectFit: 'cover',
            transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
            border: '2px solid',
            borderColor: 'divider',
          }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <Box
          className="personality-avatar"
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
            border: '2px solid',
            borderColor: 'divider',
          }}
        >
          <User style={{ width: 22, height: 22, opacity: 0.3 }} />
        </Box>
      )}
      <Box>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.75rem',
            lineHeight: 1.2,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {p.name}
        </Typography>
        {p.profession && (
          <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.125 }}>
            {p.profession}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ── Group Chip ───────────────────────────────────────────────────────

function GroupChip({ g, onClick }: { g: TagContentResult['groups'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 10,
        background: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'action.hover',
        },
      }}
    >
      {g.avatar_url ? (
        <Box
          component="img"
          src={g.avatar_url}
          alt={g.name}
          sx={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <UsersIcon style={{ width: 14, height: 14, opacity: 0.4 }} />
        </Box>
      )}
      <Typography sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{g.name}</Typography>
      {g.member_count != null && (
        <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
          {g.member_count} members
        </Typography>
      )}
      <ArrowRight style={{ width: 14, height: 14, opacity: 0.3, marginLeft: 'auto' }} />
    </Box>
  );
}

// ── Section header ───────────────────────────────────────────────────

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
        {icon}
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>
        {title}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'text.secondary',
          bgcolor: 'action.hover',
          px: 0.75,
          py: 0.125,
          borderRadius: 1,
        }}
      >
        {count}
      </Typography>
    </Box>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Skeleton variant="circular" width={20} height={20} />
        <Skeleton variant="text" width={80} height={24} />
      </Box>
      <Box sx={{ display: 'flex', gap: 2, overflow: 'hidden' }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" width={220} height={190} sx={{ borderRadius: 3, flexShrink: 0 }} />
        ))}
      </Box>
    </Box>
  );
}

// ── Main component ──────────────────────────────────────────────────

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
  const hasAny =
    venues.length > 0 ||
    news.length > 0 ||
    events.length > 0 ||
    personalities.length > 0 ||
    groups.length > 0;

  if (!hasAny) return null;

  // Split news into featured (first with image) + rest
  const featuredNews = news.find((n) => n.image_url);
  const otherNews = news.filter((n) => n !== featuredNews);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {/* Venues — horizontal scroll cards */}
      {venues.length > 0 && (
        <Box>
          <SectionHeader
            icon={<MapPin style={{ width: 18, height: 18 }} />}
            title="Venues"
            count={venues.length}
          />
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              overflowX: 'auto',
              pb: 1,
              mx: -1,
              px: 1,
              scrollSnapType: 'x mandatory',
              '&::-webkit-scrollbar': { height: 4 },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: 'divider',
                borderRadius: 2,
              },
            }}
          >
            {venues.map((v) => (
              <Box key={v.id} sx={{ scrollSnapAlign: 'start' }}>
                <VenueCard v={v} onClick={() => navigate(`/venues/${v.slug || v.id}`)} />
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Events — stacked cards with date badges */}
      {events.length > 0 && (
        <Box>
          <SectionHeader
            icon={<Calendar style={{ width: 18, height: 18 }} />}
            title="Events"
            count={events.length}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {events.map((e) => (
              <EventCard key={e.id} e={e} onClick={() => navigate(`/events/${e.slug || e.id}`)} />
            ))}
          </Box>
        </Box>
      )}

      {/* Personalities — avatar grid */}
      {personalities.length > 0 && (
        <Box>
          <SectionHeader
            icon={<User style={{ width: 18, height: 18 }} />}
            title="Personalities"
            count={personalities.length}
          />
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
            }}
          >
            {personalities.map((p) => (
              <PersonalityCard key={p.id} p={p} onClick={() => navigate(`/personalities/${p.slug || p.id}`)} />
            ))}
          </Box>
        </Box>
      )}

      {/* News — featured + compact list */}
      {news.length > 0 && (
        <Box>
          <SectionHeader
            icon={<Newspaper style={{ width: 18, height: 18 }} />}
            title="News"
            count={news.length}
          />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: featuredNews ? { xs: '1fr', sm: '1fr 1fr' } : '1fr',
              gap: 2,
            }}
          >
            {featuredNews && (
              <NewsCardFeatured
                n={featuredNews}
                onClick={() => {
                  if (featuredNews.url) window.open(featuredNews.url, '_blank', 'noopener');
                }}
              />
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {otherNews.slice(0, 4).map((n) => (
                <NewsCardCompact
                  key={n.id}
                  n={n}
                  onClick={() => {
                    if (n.url) window.open(n.url, '_blank', 'noopener');
                  }}
                />
              ))}
            </Box>
          </Box>
          {otherNews.length > 4 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {otherNews.slice(4).map((n) => (
                <NewsCardCompact
                  key={n.id}
                  n={n}
                  onClick={() => {
                    if (n.url) window.open(n.url, '_blank', 'noopener');
                  }}
                />
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Groups — pill chips */}
      {groups.length > 0 && (
        <Box>
          <SectionHeader
            icon={<UsersIcon style={{ width: 18, height: 18 }} />}
            title="Groups"
            count={groups.length}
          />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {groups.map((g) => (
              <GroupChip key={g.id} g={g} onClick={() => navigate(`/groups/${g.id}`)} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
