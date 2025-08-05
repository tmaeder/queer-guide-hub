import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";
import { useRef, useEffect } from "react";
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

const CanvasAvatar = ({ config, size }: { config: AvatarConfig; size: "sm" | "md" | "lg" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const dimensions = {
    sm: 32,
    md: 40,
    lg: 64
  };

  const canvasSize = dimensions[size];

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = canvasSize / 160; // Scale factor based on original 160px design

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale all drawing operations
    ctx.save();
    ctx.scale(scale, scale);

    // Background
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, 160, 160);

    // Face (circle)
    ctx.fillStyle = config.skinColor;
    ctx.beginPath();
    ctx.arc(80, 90, 50, 0, 2 * Math.PI);
    ctx.fill();

    // Hair
    ctx.fillStyle = config.hairColor;
    ctx.beginPath();
    switch (config.hairStyle) {
      case 'short':
        ctx.arc(80, 75, 35, Math.PI, 2 * Math.PI);
        break;
      case 'long':
        ctx.arc(80, 70, 40, Math.PI, 2 * Math.PI);
        ctx.fillRect(40, 70, 80, 30);
        break;
      case 'curly':
        for (let i = 0; i < 5; i++) {
          ctx.arc(50 + i * 15, 60 + Math.sin(i) * 5, 8, 0, 2 * Math.PI);
        }
        break;
      default:
        ctx.arc(80, 75, 35, Math.PI, 2 * Math.PI);
    }
    ctx.fill();

    // Eyes
    ctx.fillStyle = config.eyeColor;
    const eyeY = 80;
    if (config.eyeStyle === 'closed') {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(65, eyeY);
      ctx.lineTo(75, eyeY);
      ctx.moveTo(85, eyeY);
      ctx.lineTo(95, eyeY);
      ctx.stroke();
    } else if (config.eyeStyle === 'wink') {
      ctx.beginPath();
      ctx.arc(70, eyeY, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(85, eyeY);
      ctx.lineTo(95, eyeY);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(70, eyeY, 3, 0, 2 * Math.PI);
      ctx.arc(90, eyeY, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Mouth
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const mouthY = 105;
    switch (config.mouthStyle) {
      case 'smile':
        ctx.arc(80, mouthY - 5, 10, 0, Math.PI);
        break;
      case 'frown':
        ctx.arc(80, mouthY + 5, 10, Math.PI, 2 * Math.PI);
        break;
      default:
        ctx.moveTo(75, mouthY);
        ctx.lineTo(85, mouthY);
    }
    ctx.stroke();

    ctx.restore();
  }, [config, canvasSize]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize}
      height={canvasSize}
      className="rounded-full"
      style={{ width: `${canvasSize}px`, height: `${canvasSize}px` }}
    />
  );
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
      <div className={className}>
        <CanvasAvatar config={avatarConfig} size={size} />
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