import { Link } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Star } from 'lucide-react';
import { useFeaturedPersonalities, type Personality } from '@/hooks/usePersonalities';

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function FeaturedItem({ p }: { p: Personality }) {
  const href = `/personalities/${p.slug ?? p.id}`;
  return (
    <Box
      component={Link}
      to={href}
      aria-label={`${p.name}${p.profession ? ', ' + p.profession : ''}`}
      sx={{
        flex: '0 0 auto',
        width: 160,
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
        scrollSnapAlign: 'start',
        transition: 'transform 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          '& .featured-avatar': { boxShadow: 4 },
        },
      }}
    >
      <Box
        className="featured-avatar"
        sx={{
          position: 'relative',
          width: 160,
          height: 160,
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(219,39,119,0.25) 0%, rgba(245,158,11,0.25) 100%)',
          border: 2,
          borderColor: 'brand.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'box-shadow 0.2s ease',
          mb: 1,
        }}
      >
        {p.image_url ? (
          <Box
            component="img"
            src={p.image_url}
            alt={p.name}
            loading="lazy"
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Typography
            sx={{
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              fontWeight: 700,
              fontSize: '2rem',
              color: 'text.primary',
            }}
          >
            {getInitials(p.name)}
          </Typography>
        )}
      </Box>
      <Typography
        sx={{
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          fontWeight: 600,
          fontSize: '0.9rem',
          color: 'text.primary',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {p.name}
      </Typography>
      {p.profession && (
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {p.profession}
        </Typography>
      )}
    </Box>
  );
}

export function FeaturedPersonalityRail() {
  const { featured, loading, error } = useFeaturedPersonalities(10);

  if (error) return null;
  if (!loading && featured.length === 0) return null;

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Star size={18} style={{ color: '#DB2777' }} fill="#DB2777" aria-hidden="true" />
        <Typography
          component="h2"
          sx={{
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontWeight: 700,
            fontSize: '1.125rem',
            color: 'text.primary',
          }}
        >
          Featured icons
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          gap: 2.5,
          overflowX: 'auto',
          pb: 1,
          scrollSnapType: 'x mandatory',
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 },
        }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Box key={i} sx={{ flex: '0 0 auto', width: 160 }}>
                <Box
                  sx={{
                    width: 160,
                    height: 160,
                    borderRadius: '50%',
                    bgcolor: 'action.hover',
                    mb: 1,
                  }}
                />
                <Box sx={{ height: 14, bgcolor: 'action.hover', borderRadius: 0.5, mb: 0.5 }} />
                <Box sx={{ height: 12, bgcolor: 'action.hover', borderRadius: 0.5, width: '70%', mx: 'auto' }} />
              </Box>
            ))
          : featured.map((p) => <FeaturedItem key={p.id} p={p} />)}
      </Box>
    </Box>
  );
}
