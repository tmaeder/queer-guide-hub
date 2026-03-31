import { memo } from 'react';
import { Link } from 'react-router';
import { MapPin, Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardImage } from '@/components/ui/card';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
      <Card hoverable sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardImage src={imageUrl} alt={village.name} fallbackIcon={Landmark} height={180}>
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
        </CardImage>

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
      </Card>
    </Link>
  );
});
