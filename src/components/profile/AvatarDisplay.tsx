import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";
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
    const getAvatarInitials = () => {
      return avatarConfig.hair.substring(0, 1).toUpperCase() + avatarConfig.shirt.substring(0, 1).toUpperCase();
    };

    return (
      <div 
        className={`${sizeClasses[size]} ${className || ''} rounded-full flex items-center justify-center text-white font-bold`}
        style={{ backgroundColor: avatarConfig.background }}
      >
        {getAvatarInitials()}
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