import { Heart } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { useFavorites, FavoriteType } from "@/hooks/useFavorites";

interface FavoriteButtonProps {
  itemId: string;
  type: FavoriteType;
  className?: string;
  variant?: "default" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const FavoriteButton = ({ 
  itemId, 
  type, 
  className,
  variant = "ghost",
  size = "sm"
}: FavoriteButtonProps) => {
  const { isFavorited, toggleFavorite } = useFavorites(type);
  const favorited = isFavorited(itemId);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(itemId);
  };

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10", 
    lg: "h-12 w-12"
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6"
  };

  return (
    <Button
      variant={variant}
      size="icon"
      onClick={handleClick}
      className={cn(
        sizeClasses[size],
        "transition-colors duration-200",
        favorited && "text-red-500 hover:text-red-600",
        !favorited && "text-muted-foreground hover:text-foreground",
        className
      )}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart 
        className={cn(
          iconSizes[size],
          favorited && "fill-current"
        )} 
      />
    </Button>
  );
};