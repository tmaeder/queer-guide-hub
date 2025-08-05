import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";
import { BigHead } from "@bigheads/core";
import type { AvatarConfig } from "./AvatarBuilder";

interface AvatarDisplayProps {
  avatarUrl?: string;
  avatarConfig?: AvatarConfig;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-16 w-16"
};

export const AvatarDisplay = ({ 
  avatarUrl, 
  avatarConfig, 
  className, 
  size = "md" 
}: AvatarDisplayProps) => {
  if (avatarUrl) {
    return (
      <Avatar className={`${sizeClasses[size]} ${className || ''}`}>
        <AvatarImage src={avatarUrl} alt="User avatar" />
        <AvatarFallback>
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
    );
  }

  if (avatarConfig) {
    return (
      <div className={`${sizeClasses[size]} ${className || ''}`}>
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

  return (
    <Avatar className={`${sizeClasses[size]} ${className || ''}`}>
      <AvatarFallback>
        <User className="h-4 w-4" />
      </AvatarFallback>
    </Avatar>
  );
};