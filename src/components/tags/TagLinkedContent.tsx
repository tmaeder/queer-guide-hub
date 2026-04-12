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
        width: 180,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2.5,
        overflow: 'hidden',
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        flexShrink: 0,
        transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3,
          borderColor: 'primary.main',
        },
        '&:hover img': { transform: 'scale(1.05)' },
      }}
    >
      <Box sx={{ height: 110, overflow: 'hidden', position: 'relative', bgcolor: 'action.hover' }}>
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
              transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin style={{ width: 24, height: 24, opacity: 0.15 }} />
          </Box>
        )}
        {v.foursquare_rating && (
          <Box
            sx={{
              position: 'absolute',
              top: 6,
              right: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              bgcolor: 'rgba(0,0,0,0.6)',
              color: '#fff',
              borderRadius: 1,
              px: 0.5,
              py: 0.125,
              backdropFilter: 'blur(4px)',
            }}
          >
            <Star style={{ width: 10, height: 10, fill: '#f59e0b', color: '#f59e0b' }} />
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, lineHeight: 1 }}>
              {(v.foursquare_rating / 10).toFixed(1)}
            </Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ p: 1.25 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
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
            fontSize: '0.7rem',
            color: 'text.secondary',
            mt: 0.125,
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <MapPin style={{ width: 10, height: 10, flexShrink: 0 }} />
          {[v.city, v.country].filter(Boolean).join(', ') || v.category || 'Venue'}
        </Typography>
      </Box>
    </Box>
  );
}

// ── News Row (compact) ───────────────────────────────────────────────

function NewsRow({ n, onClick }: { n: TagContentResult['news'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        gap: 1.25,
        p: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        minWidth: 0,
        transition: 'all 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
      }}
    >
      {n.image_url && (
        <Box
          component="img"
          src={n.image_url}
          alt=""
          loading="lazy"
          sx={{
            width: 56,
            height: 42,
            borderRadius: 1,
            objectFit: 'cover',
            flexShrink: 0,
          }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.78rem',
            lineHeight: 1.3,
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
      {n.url && <ExternalLink style={{ width: 12, height: 12, opacity: 0.25, flexShrink: 0, alignSelf: 'center' }} />}
    </Box>
  );
}

// ── Event Row ────────────────────────────────────────────────────────

function EventRow({ e, onClick }: { e: TagContentResult['events'][number]; onClick: () => void }) {
  const date = e.start_date ? new Date(e.start_date) : null;
  const month = date?.toLocaleDateString(undefined, { month: 'short' });
  const day = date?.getDate();

  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        gap: 1.25,
        p: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'all 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
      }}
    >
      <Box
        sx={{
          width: 42,
          height: 42,
          borderRadius: 1.5,
          bgcolor: 'action.hover',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {date ? (
          <>
            <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', color: 'primary.main', lineHeight: 1 }}>
              {month}
            </Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.1 }}>
              {day}
            </Typography>
          </>
        ) : (
          <Calendar style={{ width: 16, height: 16, opacity: 0.3 }} />
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {e.title}
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 0.125 }}>
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

// ── Personality Row ──────────────────────────────────────────────────

function PersonalityRow({ p, onClick }: { p: TagContentResult['personalities'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'all 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
      }}
    >
      {p.image_url ? (
        <Box
          component="img"
          src={p.image_url}
          alt={p.name}
          loading="lazy"
          sx={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <User style={{ width: 16, height: 16, opacity: 0.3 }} />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}
        </Typography>
        {p.profession && (
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{p.profession}</Typography>
        )}
      </Box>
      <ArrowRight style={{ width: 14, height: 14, opacity: 0.25, flexShrink: 0 }} />
    </Box>
  );
}

// ── Group Row ────────────────────────────────────────────────────────

function GroupRow({ g, onClick }: { g: TagContentResult['groups'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'all 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
      }}
    >
      {g.avatar_url ? (
        <Box
          component="img"
          src={g.avatar_url}
          alt={g.name}
          sx={{ width: 36, height: 36, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <UsersIcon style={{ width: 16, height: 16, opacity: 0.3 }} />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {g.name}
        </Typography>
        <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
          {g.member_count != null && `${g.member_count} members`}
          {g.member_count != null && g.privacy && ' · '}
          {g.privacy}
        </Typography>
      </Box>
      <ArrowRight style={{ width: 14, height: 14, opacity: 0.25, flexShrink: 0 }} />
    </Box>
  );
}

// ── Section header ───────────────────────────────────────────────────

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>{icon}</Box>
      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{title}</Typography>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'text.secondary', bgcolor: 'action.hover', px: 0.625, py: 0.125, borderRadius: 0.75 }}>
        {count}
      </Typography>
    </Box>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        <Skeleton variant="circular" width={18} height={18} />
        <Skeleton variant="text" width={70} height={20} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={52} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    </Box>
  );
}

// ── Main component ──────────────────────────────────────────────────

const MAX_NEWS = 8;

export function TagLinkedContent({ tagId, tagName }: TagLinkedContentProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useTagContent(tagId, tagName);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {/* Venues — horizontal scroll */}
      {venues.length > 0 && (
        <Box sx={{ minWidth: 0 }}>
          <SectionHeader icon={<MapPin style={{ width: 16, height: 16 }} />} title="Venues" count={venues.length} />
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              overflowX: 'auto',
              pb: 0.5,
              scrollSnapType: 'x mandatory',
              '&::-webkit-scrollbar': { height: 3 },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 2 },
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

      {/* Events */}
      {events.length > 0 && (
        <Box sx={{ minWidth: 0 }}>
          <SectionHeader icon={<Calendar style={{ width: 16, height: 16 }} />} title="Events" count={events.length} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {events.map((e) => (
              <EventRow key={e.id} e={e} onClick={() => navigate(`/events/${e.slug || e.id}`)} />
            ))}
          </Box>
        </Box>
      )}

      {/* Personalities */}
      {personalities.length > 0 && (
        <Box sx={{ minWidth: 0 }}>
          <SectionHeader icon={<User style={{ width: 16, height: 16 }} />} title="Personalities" count={personalities.length} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {personalities.map((p) => (
              <PersonalityRow key={p.id} p={p} onClick={() => navigate(`/personalities/${p.slug || p.id}`)} />
            ))}
          </Box>
        </Box>
      )}

      {/* News — capped list */}
      {news.length > 0 && (
        <Box sx={{ minWidth: 0 }}>
          <SectionHeader icon={<Newspaper style={{ width: 16, height: 16 }} />} title="News" count={news.length} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {news.slice(0, MAX_NEWS).map((n) => (
              <NewsRow
                key={n.id}
                n={n}
                onClick={() => { if (n.url) window.open(n.url, '_blank', 'noopener'); }}
              />
            ))}
          </Box>
          {news.length > MAX_NEWS && (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1, textAlign: 'center' }}>
              +{news.length - MAX_NEWS} more articles
            </Typography>
          )}
        </Box>
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <Box sx={{ minWidth: 0 }}>
          <SectionHeader icon={<UsersIcon style={{ width: 16, height: 16 }} />} title="Groups" count={groups.length} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {groups.map((g) => (
              <GroupRow key={g.id} g={g} onClick={() => navigate(`/groups/${g.id}`)} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
