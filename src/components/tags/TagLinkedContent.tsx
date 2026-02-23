import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Newspaper,
  Calendar,
  Users as UsersIcon,
  User,
  ChevronRight,
  Star,
  ExternalLink,
} from 'lucide-react';
import { useTagContent, TagContentResult } from '@/hooks/useTagContent';
import { formatDistanceToNow } from 'date-fns';

interface TagLinkedContentProps {
  tagId: string;
  tagName: string;
}

// ── Compact list item helpers ──────────────────────────────────────────

function VenueRow({ v, onClick }: { v: TagContentResult['venues'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
        p: 1, border: 'none', background: 'none', cursor: 'pointer',
        borderRadius: 1.5, textAlign: 'left',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {v.image_url ? (
        <Box
          component="img"
          src={v.image_url}
          alt={v.name}
          sx={{ width: 44, height: 44, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <Box sx={{ width: 44, height: 44, borderRadius: 1.5, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MapPin style={{ width: 18, height: 18, opacity: 0.4 }} />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {v.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {v.city && <>{v.city}</>}
          {v.city && v.country && <> · </>}
          {v.country && <>{v.country}</>}
          {!v.city && !v.country && v.category && <>{v.category}</>}
        </Typography>
      </Box>
      {v.foursquare_rating && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
          <Star style={{ width: 12, height: 12, fill: '#f59e0b', color: '#f59e0b' }} />
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
            {(v.foursquare_rating / 10).toFixed(1)}
          </Typography>
        </Box>
      )}
      <ChevronRight style={{ width: 14, height: 14, opacity: 0.3, flexShrink: 0 }} />
    </Box>
  );
}

function NewsRow({ n, onClick }: { n: TagContentResult['news'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
        p: 1, border: 'none', background: 'none', cursor: 'pointer',
        borderRadius: 1.5, textAlign: 'left',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {n.image_url ? (
        <Box
          component="img"
          src={n.image_url}
          alt={n.title}
          sx={{ width: 44, height: 44, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <Box sx={{ width: 44, height: 44, borderRadius: 1.5, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Newspaper style={{ width: 18, height: 18, opacity: 0.4 }} />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {n.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {n.news_sources?.name && <>{n.news_sources.name}</>}
          {n.news_sources?.name && n.published_at && <> · </>}
          {n.published_at && <>{formatDistanceToNow(new Date(n.published_at), { addSuffix: true })}</>}
        </Typography>
      </Box>
      {n.url && <ExternalLink style={{ width: 14, height: 14, opacity: 0.3, flexShrink: 0 }} />}
    </Box>
  );
}

function EventRow({ e, onClick }: { e: TagContentResult['events'][number]; onClick: () => void }) {
  const dateStr = e.start_date
    ? new Date(e.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
        p: 1, border: 'none', background: 'none', cursor: 'pointer',
        borderRadius: 1.5, textAlign: 'left',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {e.image_url ? (
        <Box
          component="img"
          src={e.image_url}
          alt={e.title}
          sx={{ width: 44, height: 44, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <Box sx={{ width: 44, height: 44, borderRadius: 1.5, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Calendar style={{ width: 18, height: 18, opacity: 0.4 }} />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {dateStr && <>{dateStr}</>}
          {dateStr && e.city && <> · </>}
          {e.city && <>{e.city}</>}
        </Typography>
      </Box>
      {e.event_type && (
        <Badge variant="secondary" style={{ fontSize: '0.65rem', textTransform: 'capitalize' }}>
          {e.event_type}
        </Badge>
      )}
      <ChevronRight style={{ width: 14, height: 14, opacity: 0.3, flexShrink: 0 }} />
    </Box>
  );
}

function PersonalityRow({ p, onClick }: { p: TagContentResult['personalities'][number]; onClick: () => void }) {
  const lifespan = p.birth_date
    ? `${new Date(p.birth_date).getFullYear()}${p.death_date ? '–' + new Date(p.death_date).getFullYear() : ''}`
    : null;

  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
        p: 1, border: 'none', background: 'none', cursor: 'pointer',
        borderRadius: 1.5, textAlign: 'left',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {p.image_url ? (
        <Box
          component="img"
          src={p.image_url}
          alt={p.name}
          sx={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <User style={{ width: 18, height: 18, opacity: 0.4 }} />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {p.profession && <>{p.profession}</>}
          {p.profession && lifespan && <> · </>}
          {lifespan && <>{lifespan}</>}
        </Typography>
      </Box>
      <ChevronRight style={{ width: 14, height: 14, opacity: 0.3, flexShrink: 0 }} />
    </Box>
  );
}

function GroupRow({ g, onClick }: { g: TagContentResult['groups'][number]; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
        p: 1, border: 'none', background: 'none', cursor: 'pointer',
        borderRadius: 1.5, textAlign: 'left',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {g.avatar_url ? (
        <Box
          component="img"
          src={g.avatar_url}
          alt={g.name}
          sx={{ width: 44, height: 44, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <Box sx={{ width: 44, height: 44, borderRadius: 1.5, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <UsersIcon style={{ width: 18, height: 18, opacity: 0.4 }} />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {g.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {g.member_count != null && <>{g.member_count} members</>}
          {g.privacy && <> · {g.privacy}</>}
        </Typography>
      </Box>
      <ChevronRight style={{ width: 14, height: 14, opacity: 0.3, flexShrink: 0 }} />
    </Box>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}

function ContentSection({ icon, title, count, children }: SectionProps) {
  return (
    <Card>
      <CardHeader sx={{ pb: 0 }}>
        <CardTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {icon}
            {title}
            <Badge variant="secondary" style={{ fontWeight: 500, fontSize: '0.7rem' }}>
              {count}
            </Badge>
          </Box>
        </CardTitle>
      </CardHeader>
      <CardContent sx={{ pt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {children}
        </Box>
      </CardContent>
    </Card>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
          {[1, 2, 3].map((i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Skeleton variant="rounded" width={44} height={44} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" height={18} />
                <Skeleton variant="text" width="40%" height={14} />
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function TagLinkedContent({ tagId, tagName }: TagLinkedContentProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useTagContent(tagId, tagName);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {venues.length > 0 && (
        <ContentSection
          icon={<MapPin style={{ width: 18, height: 18 }} />}
          title="Venues"
          count={venues.length}
        >
          {venues.map((v) => (
            <VenueRow key={v.id} v={v} onClick={() => navigate(`/venues/${v.id}`)} />
          ))}
        </ContentSection>
      )}

      {events.length > 0 && (
        <ContentSection
          icon={<Calendar style={{ width: 18, height: 18 }} />}
          title="Events"
          count={events.length}
        >
          {events.map((e) => (
            <EventRow key={e.id} e={e} onClick={() => navigate(`/events/${e.id}`)} />
          ))}
        </ContentSection>
      )}

      {personalities.length > 0 && (
        <ContentSection
          icon={<User style={{ width: 18, height: 18 }} />}
          title="Personalities"
          count={personalities.length}
        >
          {personalities.map((p) => (
            <PersonalityRow key={p.id} p={p} onClick={() => navigate(`/personalities/${p.id}`)} />
          ))}
        </ContentSection>
      )}

      {news.length > 0 && (
        <ContentSection
          icon={<Newspaper style={{ width: 18, height: 18 }} />}
          title="News"
          count={news.length}
        >
          {news.map((n) => (
            <NewsRow
              key={n.id}
              n={n}
              onClick={() => {
                if (n.url) window.open(n.url, '_blank', 'noopener');
              }}
            />
          ))}
        </ContentSection>
      )}

      {groups.length > 0 && (
        <ContentSection
          icon={<UsersIcon style={{ width: 18, height: 18 }} />}
          title="Groups"
          count={groups.length}
        >
          {groups.map((g) => (
            <GroupRow key={g.id} g={g} onClick={() => navigate(`/groups/${g.id}`)} />
          ))}
        </ContentSection>
      )}
    </Box>
  );
}
