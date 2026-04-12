import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { Parallax } from '@/components/motion';

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
        position: 'relative',
      }}
    >
      <Parallax speed={0.25}>
        <Box
          component="img"
          src={imageUrl}
          alt={alt}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scale(1.1)',
          }}
        />
      </Parallax>
    </Box>
  );
}
