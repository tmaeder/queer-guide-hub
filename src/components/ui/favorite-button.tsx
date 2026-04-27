import React, { useRef, useEffect } from "react";
import { Heart } from "lucide-react";
import { Button } from "./button";
import { useFavorites, FavoriteType } from "@/hooks/useFavorites";
import { useHaptics } from "@/hooks/useHaptics";
import { useSaveAction } from "@/hooks/useSearchActions";

interface FavoriteButtonProps {
  itemId: string;
  type: FavoriteType;
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
  const { trigger } = useHaptics();
  const trackSave = useSaveAction();

  const [animating, setAnimating] = React.useState(false);
  const timerRef = useRef<number>();

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    trigger(favorited ? 'nudge' : 'success');
    if (!favorited) {
      setAnimating(true);
      clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setAnimating(false), 400);
    }
    toggleFavorite(itemId);
    // Feed search-proxy bias vector. `favorited` is the previous state — invert.
    trackSave({ type, id: itemId }, !favorited);
  };

  const iconSize = iconPixels[size];

  return (
    <Button
      variant={variant}
      size="icon"
      onClick={handleClick}
      style={{
        ...sizeStyles[size],
        color: favorited ? 'hsl(var(--brand))' : 'hsl(var(--muted-foreground))',
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
