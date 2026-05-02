import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { BigHead } from '@bigheads/core';
import type { AvatarConfig } from './AvatarBuilder';
import { generateAvatarUrl } from '@/lib/avatar';

interface AvatarDisplayProps {
  avatarUrl?: string;
  avatarConfig?: AvatarConfig;
  email?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles = {
  sm: { width: 32, height: 32 },
  md: { width: 40, height: 40 },
  lg: { width: 64, height: 64 },
};

const sizePixels = {
  sm: 32,
  md: 40,
  lg: 64,
};

export const AvatarDisplay = ({
  avatarUrl,
  avatarConfig,
  email,
  size = 'md',
}: AvatarDisplayProps) => {
  const initialsUrl = generateAvatarUrl(email, sizePixels[size]);
  const dims = sizeStyles[size];

  // Priority: avatarUrl > avatarConfig > initials > fallback
  if (avatarUrl) {
    return (
      <Avatar>
        <span style={{ ...dims, display: 'inline-flex' }}>
          <AvatarImage src={avatarUrl} alt="User avatar" />
          <AvatarFallback>
            <User style={{ width: 16, height: 16 }} />
          </AvatarFallback>
        </span>
      </Avatar>
    );
  }

  if (avatarConfig) {
    return (
      <div style={dims}>
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
      </div>
    );
  }

  // Use initials avatar if email is available
  if (initialsUrl) {
    return (
      <Avatar>
        <span style={{ ...dims, display: 'inline-flex' }}>
          <AvatarImage src={initialsUrl} alt="User avatar" />
          <AvatarFallback>
            <User style={{ width: 16, height: 16 }} />
          </AvatarFallback>
        </span>
      </Avatar>
    );
  }

  return (
    <Avatar>
      <span style={{ ...dims, display: 'inline-flex' }}>
        <AvatarFallback>
          <User style={{ width: 16, height: 16 }} />
        </AvatarFallback>
      </span>
    </Avatar>
  );
};
