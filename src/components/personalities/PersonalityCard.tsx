import { useState } from 'react';
import { Link } from 'react-router';
import { Star } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import type { Personality } from '@/hooks/usePersonalities';

interface PersonalityCardProps {
  personality?: Personality;
  loading?: boolean;
  onClick?: () => void;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatEra(p: Personality): string | null {
  if (p.is_living) return 'Living';
  const birthYear = p.birth_date ? new Date(p.birth_date).getFullYear() : null;
  const deathYear = p.death_date ? new Date(p.death_date).getFullYear() : null;
  if (birthYear && deathYear) return `${birthYear}\u2013${deathYear}`;
  if (birthYear) return `b. ${birthYear}`;
  if (deathYear) return `d. ${deathYear}`;
  return 'Historical';
}

export function PersonalityCardSkeleton() {
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ position: 'relative', width: '100%', pt: '133.33%', bgcolor: 'action.hover' }}>
        <Skeleton
          variant="rectangular"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </Box>
      <Box sx={{ p: 1.5 }}>
        <Skeleton variant="text" width="75%" />
        <Skeleton variant="text" width="55%" />
        <Skeleton variant="text" width="65%" />
      </Box>
    </Box>
  );
}

export function PersonalityCard({ personality, loading, onClick }: PersonalityCardProps) {
  const [imgError, setImgError] = useState(false);

  if (loading || !personality) {
    return <PersonalityCardSkeleton />;
  }

  const era = formatEra(personality);
  const showImage = Boolean(personality.image_url) && !imgError;
  const metaParts = [era, personality.nationality].filter(Boolean) as string[];
  const ariaLabel = personality.profession
    ? `${personality.name}, ${personality.profession}`
    : personality.name;
  const href = `/personalities/${personality.slug ?? personality.id}`;

  return (
    <Box
      component={Link}
      to={href}
      onClick={onClick}
      aria-label={ariaLabel}
      sx={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        '&:hover': {
          transform: 'translateY(-2px)',
          '& .personality-card-image': { transform: 'scale(1.04)' },
        },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'brand.main',
          outlineOffset: 2,
        },
      }}
    >
      {/* Image */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          pt: '133.33%',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(219,39,119,0.18) 0%, rgba(245,158,11,0.18) 100%)',
        }}
      >
        {showImage ? (
          <Box
            component="img"
            src={personality.image_url}
            alt={personality.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="personality-card-image"
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
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
            }}
          >
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                bgcolor: 'background.paper',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                fontWeight: 700,
                fontSize: '1.25rem',
                color: 'text.primary',
                boxShadow: 1,
              }}
            >
              {getInitials(personality.name)}
            </Box>
          </Box>
        )}

        {personality.is_featured && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.375,
              borderRadius: 999,
              bgcolor: 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(4px)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'text.primary',
              boxShadow: 1,
            }}
          >
            <Star size={12} fill="#DB2777" color="#DB2777" aria-hidden="true" />
            <span>Featured</span>
          </Box>
        )}
      </Box>

      {/* Content */}
      <Box sx={{ p: 1.5 }}>
        <Typography
          component="h3"
          sx={{
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontWeight: 600,
            fontSize: '0.95rem',
            lineHeight: 1.3,
            color: 'text.primary',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {personality.name}
        </Typography>
        {personality.profession && (
          <Typography
            sx={{
              fontSize: '0.8125rem',
              color: 'text.secondary',
              mt: 0.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {personality.profession}
          </Typography>
        )}
        {metaParts.length > 0 && (
          <Typography
            sx={{
              fontSize: '0.75rem',
              color: 'text.secondary',
              opacity: 0.85,
              mt: 0.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {metaParts.join(' \u00b7 ')}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
