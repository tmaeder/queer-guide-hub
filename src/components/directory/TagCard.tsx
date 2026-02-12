import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tag as TagIcon, Calendar, MapPin, ShoppingBag, Users } from "lucide-react";
import { Tag } from "@/hooks/useTags";
import { FavoriteButton } from "@/components/ui/favorite-button";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface TagCardProps {
  tag: Tag;
  category?: string;
  onClick?: () => void;
}
export const TagCard = ({
  tag,
  category,
  onClick
}: TagCardProps) => {
  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "events":
        return Calendar;
      case "venues":
        return MapPin;
      case "marketplace":
        return ShoppingBag;
      case "community":
        return Users;
      default:
        return TagIcon;
    }
  };
  const getPrimaryCategory = () => {
    if (category) return category;
    if (!tag.usage_by_category || tag.usage_by_category.length === 0) return "general";

    // Return the category with highest usage
    return tag.usage_by_category.reduce((prev, current) => prev.count > current.count ? prev : current).category;
  };
  const primaryCategory = getPrimaryCategory();
  const IconComponent = getCategoryIcon(primaryCategory);
  return <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 2 }, transition: 'box-shadow 0.2s' }} onClick={onClick}>
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconComponent style={{ height: 16, width: 16, color: 'var(--primary)' }} />
            <Badge variant="outline" sx={{ fontFamily: 'monospace' }}>
              #{tag.name}
            </Badge>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FavoriteButton itemId={tag.id || tag.name} type="tag" size="sm" />
            <Badge variant="secondary" sx={{ fontSize: '0.75rem' }}>
              {tag.total_count}
            </Badge>
          </Box>
        </Box>

        {tag.categories && tag.categories.length > 1 && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
            {tag.categories.map(cat => {
          const CatIcon = getCategoryIcon(cat);
          const usage = tag.usage_by_category?.find(u => u.category === cat);
          return <Box key={cat} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                  <CatIcon style={{ height: 12, width: 12 }} />
                  <Box component="span" sx={{ textTransform: 'capitalize' }}>{cat}</Box>
                  {usage && <span>({usage.count})</span>}
                </Box>;
        })}
          </Box>}

        {tag.description && (
          <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {tag.description}
          </Typography>
        )}

      </CardContent>
    </Card>;
};
