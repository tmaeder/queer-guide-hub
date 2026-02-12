import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";
import { BigHead } from "@bigheads/core";
import type { AvatarConfig } from "./AvatarBuilder";
import { getGravatarUrl } from "@/lib/gravatar";
import Box from '@mui/material/Box';

interface AvatarDisplayProps {
  avatarUrl?: string;
  avatarConfig?: AvatarConfig;
  email?: string;
  sx?: object;
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: { width: 32, height: 32 },
  md: { width: 40, height: 40 },
  lg: { width: 64, height: 64 }
};

const sizePixels = {
  sm: 32,
  md: 40,
  lg: 64
};

export const AvatarDisplay = ({
  avatarUrl,
  avatarConfig,
  email,
  sx,
  size = "md"
}: AvatarDisplayProps) => {
  const gravatarUrl = getGravatarUrl(email, sizePixels[size]);

  // Priority: avatarUrl > avatarConfig > gravatarUrl > fallback
  if (avatarUrl) {
    return (
      <Avatar>
        <Box component="span" sx={{ ...sizeStyles[size], display: 'inline-flex', ...sx }}>
          <AvatarImage src={avatarUrl} alt="User avatar" />
          <AvatarFallback>
            <User style={{ width: 16, height: 16 }} />
          </AvatarFallback>
        </Box>
      </Avatar>
    );
  }

  if (avatarConfig) {
    return (
      <Box sx={{ ...sizeStyles[size], ...sx }}>
        <BigHead
          accessory={avatarConfig.accessory}
          body={avatarConfig.body}
          clothing={avatarConfig.clothing}
          clothingColor={avatarConfig.clothingColor}
          eyebrows={avatarConfig.eyebrows}
          eyes={avatarConfig.eyes}
          facialHair={avatarConfig.facialHair}
          graphic={avatarConfig.graphic}
          hair={avatarConfig.hair}
          hairColor={avatarConfig.hairColor}
          hat={avatarConfig.hat}
          hatColor={avatarConfig.hatColor}
          lashes={avatarConfig.lashes}
          lipColor={avatarConfig.lipColor}
          mask={avatarConfig.mask}
          mouth={avatarConfig.mouth}
          skinTone={avatarConfig.skinTone}
          circleColor={avatarConfig.circleColor}
        />
      </Box>
    );
  }

  // Use Gravatar if available
  if (gravatarUrl) {
    return (
      <Avatar>
        <Box component="span" sx={{ ...sizeStyles[size], display: 'inline-flex', ...sx }}>
          <AvatarImage src={gravatarUrl} alt="Gravatar avatar" />
          <AvatarFallback>
            <User style={{ width: 16, height: 16 }} />
          </AvatarFallback>
        </Box>
      </Avatar>
    );
  }

  return (
    <Avatar>
      <Box component="span" sx={{ ...sizeStyles[size], display: 'inline-flex', ...sx }}>
        <AvatarFallback>
          <User style={{ width: 16, height: 16 }} />
        </AvatarFallback>
      </Box>
    </Avatar>
  );
};
