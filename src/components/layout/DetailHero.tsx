import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

interface DetailHeroProps {
  imageUrl?: string | null;
  alt: string;
  height?: SxProps<Theme>['height'];
}

export function DetailHero({ imageUrl, alt, height = { xs: 192, md: 240 } }: DetailHeroProps) {
  if (!imageUrl) return null;
  return (
    <Box
      sx={{
        width: '100%',
        height,
        borderRadius: 2,
        overflow: 'hidden',
        mb: 2,
      }}
    >
      <Box
        component="img"
        src={imageUrl}
        alt={alt}
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </Box>
  );
}
