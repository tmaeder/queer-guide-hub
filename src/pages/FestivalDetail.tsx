import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Music,
  Globe,
  ExternalLink,
  Share2,
  Clock,
  Tag,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { FestivalSchedule } from '@/components/festivals/FestivalSchedule';
import { useFestivals, type FestivalWithEvents } from '@/hooks/useFestivals';
import { format } from 'date-fns';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';

const TYPE_LABELS: Record<string, string> = {
  festival: 'Festival',
  pride: 'Pride',
  conference: 'Conference',
  series: 'Series',
  other: 'Other',
};

export default function FestivalDetail() {
  const { id } = useParams<{ id: string }>();
  const { fetchFestivalWithEvents } = useFestivals(false);
  const [festival, setFestival] = useState<FestivalWithEvents | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchFestivalWithEvents(id)
      .then((data) => setFestival(data))
      .catch(() => setFestival(null))
      .finally(() => setLoading(false));
  }, [id, fetchFestivalWithEvents]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!festival) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Festival Not Found
        </Typography>
        <Link to="/festivals">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} /> Back to Festivals
          </Button>
        </Link>
      </Container>
    );
  }

  const location = [festival.cities?.name, festival.countries?.name].filter(Boolean).join(', ');
  const cityLink = festival.cities?.id ? `/cities/${festival.cities.id}` : null;

  const dateRange = (() => {
    if (!festival.start_date) return 'Dates TBA';
    const start = new Date(festival.start_date);
    if (!festival.end_date) return format(start, 'MMMM d, yyyy');
    const end = new Date(festival.end_date);
    if (format(start, 'yyyy-MM') === format(end, 'yyyy-MM')) {
      return `${format(start, 'MMMM d')} - ${format(end, 'd, yyyy')}`;
    }
    return `${format(start, 'MMMM d')} - ${format(end, 'MMMM d, yyyy')}`;
  })();

  const eventCount = festival.events?.length ?? 0;
  const heroImage = festival.images && festival.images.length > 0 ? festival.images[0] : null;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: festival.name, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Link to="/festivals" style={{ color: 'inherit', textDecoration: 'none' }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ '&:hover': { color: 'primary.main' } }}
          >
            Festivals
          </Typography>
        </Link>
        <Typography variant="body2" color="text.secondary">
          /
        </Typography>
        <Typography variant="body2" color="text.primary" fontWeight={500}>
          {festival.name}
        </Typography>
      </Box>

      {/* Hero Image */}
      {heroImage && (
        <Box sx={{ borderRadius: 2, overflow: 'hidden', mb: 3, height: { xs: 200, md: 320 } }}>
          <img
            src={heroImage}
            alt={festival.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Box>
      )}

      {/* Title Row */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { md: 'flex-start' },
          justifyContent: { md: 'space-between' },
          gap: 2,
          mb: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {festival.name}
            </Typography>
            {festival.featured && (
              <Badge style={{ backgroundColor: '#333', color: '#fff' }}>Featured</Badge>
            )}
            <Chip
              size="small"
              icon={<Music style={{ width: 14, height: 14 }} />}
              label={TYPE_LABELS[festival.festival_type] || festival.festival_type}
            />
          </Box>
          {location && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <MapPin style={{ width: 14, height: 14, color: '#9ca3af' }} />
              <Typography variant="body2" color="text.secondary">
                {cityLink ? (
                  <Link to={cityLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                    >
                      {location}
                    </Typography>
                  </Link>
                ) : (
                  location
                )}
              </Typography>
            </Box>
          )}
        </Box>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}
        >
          <FavoriteButton itemId={festival.id} type="event" size="md" />
          <ReportButton
            contentType="festivals"
            contentId={festival.id}
            contentName={festival.name}
          />
          <AdminEditButton
            contentType="festivals"
            contentId={festival.id}
            contentName={festival.name}
            currentData={festival as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
          {festival.ticket_url && (
            <Button size="sm" asChild>
              <a href={festival.ticket_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} /> Tickets
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 style={{ width: 16, height: 16, marginRight: 6 }} /> Share
          </Button>
        </Box>
      </Box>

      {/* Stat Chips */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        <Chip
          icon={<Calendar style={{ width: 14, height: 14 }} />}
          label={dateRange}
          size="small"
          variant="outlined"
        />
        {eventCount > 0 && (
          <Chip
            icon={<Clock style={{ width: 14, height: 14 }} />}
            label={`${eventCount} event${eventCount !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
          />
        )}
        {festival.is_recurring && (
          <Chip label="Recurring" color="info" size="small" variant="outlined" />
        )}
        {festival.website && (
          <Chip
            icon={<Globe style={{ width: 14, height: 14 }} />}
            label="Website"
            size="small"
            variant="outlined"
            component="a"
            href={festival.website}
            target="_blank"
            clickable
          />
        )}
      </Box>

      {/* Tags */}
      {festival.tags && festival.tags.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 3 }}>
          {festival.tags.map((tag) => (
            <Chip
              key={tag}
              size="small"
              icon={<Tag style={{ width: 10, height: 10 }} />}
              label={tag}
              variant="outlined"
            />
          ))}
        </Box>
      )}

      {/* Tabs */}
      <Tabs
        value={tabIndex}
        onChange={(_, v) => setTabIndex(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab label="Overview" />
        <Tab label={`Schedule (${eventCount})`} />
        {festival.images && festival.images.length > 1 && <Tab label="Photos" />}
      </Tabs>

      {/* Overview Tab */}
      {tabIndex === 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 3 }}>
          <Box>
            {festival.description && (
              <Card sx={{ mb: 3, borderColor: 'divider' }}>
                <CardHeader>
                  <CardTitle>About</CardTitle>
                </CardHeader>
                <CardContent>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                    {festival.description}
                  </Typography>
                </CardContent>
              </Card>
            )}

            {/* Inline schedule preview */}
            {eventCount > 0 && (
              <Card sx={{ borderColor: 'divider' }}>
                <CardHeader>
                  <CardTitle
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Schedule Preview</span>
                    <Button variant="link" size="sm" onClick={() => setTabIndex(1)}>
                      View Full Schedule
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FestivalSchedule
                    events={(festival.events ?? []).slice(0, 10)}
                    timezone={festival.timezone}
                  />
                </CardContent>
              </Card>
            )}
          </Box>

          {/* Sidebar */}
          <Box>
            <Card sx={{ borderColor: 'divider' }}>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Dates
                    </Typography>
                    <Typography variant="body2">{dateRange}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Type
                    </Typography>
                    <Typography variant="body2">
                      {TYPE_LABELS[festival.festival_type] || festival.festival_type}
                    </Typography>
                  </Box>
                  {location && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Location
                      </Typography>
                      <Typography variant="body2">{location}</Typography>
                    </Box>
                  )}
                  {festival.timezone && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Timezone
                      </Typography>
                      <Typography variant="body2">{festival.timezone}</Typography>
                    </Box>
                  )}
                  {festival.recurrence_pattern && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Recurrence
                      </Typography>
                      <Typography variant="body2">{festival.recurrence_pattern}</Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      )}

      {/* Schedule Tab */}
      {tabIndex === 1 && (
        <FestivalSchedule events={festival.events ?? []} timezone={festival.timezone} />
      )}

      {/* Photos Tab */}
      {tabIndex === 2 && festival.images && festival.images.length > 1 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {festival.images.map((img, i) => (
            <Box key={i} sx={{ borderRadius: 2, overflow: 'hidden', aspectRatio: '4/3' }}>
              <img
                src={img}
                alt={`${festival.name} photo ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </Box>
          ))}
        </Box>
      )}
    </Container>
  );
}
