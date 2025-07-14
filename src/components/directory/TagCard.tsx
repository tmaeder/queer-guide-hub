import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tag as TagIcon, Calendar, MapPin, ShoppingBag, Users } from "lucide-react";
import { Tag } from "@/hooks/useTags";

interface TagCardProps {
  tag: Tag;
  category?: string;
  onClick?: () => void;
}

export const TagCard = ({ tag, category, onClick }: TagCardProps) => {
  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "events": return Calendar;
      case "venues": return MapPin;
      case "marketplace": return ShoppingBag;
      case "community": return Users;
      default: return TagIcon;
    }
  };

  const getPrimaryCategory = () => {
    if (category) return category;
    if (!tag.usage_by_category || tag.usage_by_category.length === 0) return "general";
    
    // Return the category with highest usage
    return tag.usage_by_category.reduce((prev, current) => 
      prev.count > current.count ? prev : current
    ).category;
  };

  const primaryCategory = getPrimaryCategory();
  const IconComponent = getCategoryIcon(primaryCategory);

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow duration-200"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <IconComponent className="h-4 w-4 text-primary" />
            <Badge variant="outline" className="font-mono">
              #{tag.name}
            </Badge>
          </div>
          <Badge variant="secondary" className="text-xs">
            {tag.total_count}
          </Badge>
        </div>

        {tag.categories && tag.categories.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tag.categories.map((cat) => {
              const CatIcon = getCategoryIcon(cat);
              const usage = tag.usage_by_category?.find(u => u.category === cat);
              return (
                <div key={cat} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CatIcon className="h-3 w-3" />
                  <span className="capitalize">{cat}</span>
                  {usage && <span>({usage.count})</span>}
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            Used in {tag.categories?.length || 1} {(tag.categories?.length || 1) === 1 ? 'category' : 'categories'}
          </div>
          
          {tag.usage_by_category && tag.usage_by_category.length > 0 && (
            <div className="w-full bg-muted h-2 overflow-hidden">
              <div className="h-full flex">
                {tag.usage_by_category.map((usage, index) => {
                  const percentage = (usage.count / tag.total_count) * 100;
                  const colors = [
                    "bg-primary",
                    "bg-secondary", 
                    "bg-accent",
                    "bg-muted-foreground"
                  ];
                  return (
                    <div
                      key={usage.category}
                      className={`${colors[index % colors.length]} transition-all duration-300`}
                      style={{ width: `${percentage}%` }}
                      title={`${usage.category}: ${usage.count}`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};