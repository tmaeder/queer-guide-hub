import React from "react";
import { Heart } from "lucide-react";
import { Button } from "./button";
import { useFavorites, FavoriteType } from "@/hooks/useFavorites";

interface FavoriteButtonProps {
  itemId: string;
  type: FavoriteType;
  className?: string;
  variant?: "default" | "ghost";
  size?: "sm" | "md" | "lg";
}

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { height: 32, width: 32 },
  md: { height: 40, width: 40 },
  lg: { height: 48, width: 48 },
};

const iconPixels: Record<string, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

export const FavoriteButton = ({
  itemId,
  type,
  variant = "ghost",
  size = "sm"
}: FavoriteButtonProps) => {
  const { isFavorited, toggleFavorite } = useFavorites(type);
  const favorited = isFavorited(itemId);

  const [animating, setAnimating] = React.useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!favorited) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 400);
    }
    toggleFavorite(itemId);
  };

  const iconSize = iconPixels[size];

  return (
    <Button
      variant={variant}
      size="icon"
      onClick={handleClick}
      style={{
        ...sizeStyles[size],
        color: favorited ? '#ef4444' : '#999999',
        transition: 'color 0.2s',
      }}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart
        className={animating ? 'heart-pop' : ''}
        style={{
          height: iconSize,
          width: iconSize,
          fill: favorited ? 'currentColor' : 'none',
          transition: 'fill 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </Button>
  );
};
