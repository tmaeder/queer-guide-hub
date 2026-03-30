import { memo } from 'react';
import { Link } from 'react-router';
import { MapPin, Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import type { QueerVillageWithRelations } from '@/hooks/useQueerVillages';

interface VillageCardProps {
  village: QueerVillageWithRelations;
}

export const VillageCard = memo(function VillageCard({ village }: VillageCardProps) {
  const imageUrl = village.image_url;
  const cityName = village.cities?.name;
  const countryName = village.countries?.name;

  return (
    <Link to={`/villages/${village.slug}`} style={{ textDecoration: 'none' }}>
      <Paper
        elevation={1}
        sx={{
          overflow: 'hidden',
          borderRadius: 3,
          transition: 'all 0.2s',
          '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{ position: 'relative', height: 180, overflow: 'hidden', bgcolor: 'action.hover' }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={village.name}
              width={400}
              height={180}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              loading="lazy"
            />
          ) : (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
              }}
            >
              <Landmark style={{ width: 32, height: 32, color: '#999999' }} />
            </Box>
          )}
          {village.featured && (
            <Badge
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: 'hsl(var(--primary))',
                color: 'white',
              }}
            >
              Featured
            </Badge>
          )}
        </Box>

        <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
            {village.name}
          </Typography>

          {(cityName || countryName) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
              <MapPin style={{ width: 14, height: 14, flexShrink: 0 }} />
              <Typography variant="body2" noWrap>
                {[cityName, countryName].filter(Boolean).join(', ')}
              </Typography>
            </Box>
          )}

          {village.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {village.description}
            </Typography>
          )}
        </Box>
      </Paper>
    </Link>
  );
});
