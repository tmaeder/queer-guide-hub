import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Eye, Calendar, MapPin, Tag, Newspaper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Tables } from "@/integrations/supabase/types";
import { Link } from "react-router-dom";
import { FavoriteButton } from "@/components/ui/favorite-button";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type NewsArticle = Tables<'news_articles'> & {
  news_sources: Tables<'news_sources'>;
};
interface NewsCardProps {
  article: NewsArticle;
  onViewArticle?: (articleId: string) => void;
  showFullContent?: boolean;
}
export const NewsCard = ({
  article,
  onViewArticle,
  showFullContent = false
}: NewsCardProps) => {
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const { data } = await supabase
          .from('unified_tag_assignments')
          .select(`
            unified_tags!inner(name, color)
          `)
          .eq('entity_type', 'news')
          .eq('entity_id', article.id);

        if (data) {
          const tagNames = data.map(assignment => 
            (assignment.unified_tags as any).name
          );
          setTags(tagNames);
        }
      } catch (error) {
        console.error('Error fetching article tags:', error);
      }
    };

    fetchTags();
  }, [article.id]);
  const handleViewClick = () => {
    onViewArticle?.(article.id);
    window.open(article.url, '_blank');
  };
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'rights-legal': 'hsl(var(--destructive))',
      'health-wellness': 'hsl(var(--success))',
      'politics': 'hsl(var(--primary))',
      'culture-arts': 'hsl(var(--secondary))',
      'business-economy': 'hsl(var(--warning))',
      'education': 'hsl(var(--info))',
      'community': 'hsl(var(--accent))',
      'international': 'hsl(var(--muted))',
      'technology': 'hsl(var(--primary))',
      'sports': 'hsl(var(--warning))'
    };
    return colors[category] || 'hsl(var(--muted))';
  };
  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return 'hsl(var(--success))';
      case 'negative':
        return 'hsl(var(--destructive))';
      default:
        return 'hsl(var(--muted))';
    }
  };
  return <Card className="group hover:shadow-lg transition-all duration-300">
      <CardHeader className="space-y-3">
        {article.image_url && <div className="relative overflow-hidden">
            <img src={article.image_url} alt={article.title} className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-105" />
            {article.is_featured && <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground">
                Featured
              </Badge>}
          </div>}
        
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors">
            {article.title}
          </h3>
          {article.sentiment && <Badge variant="outline" style={{
          borderColor: getSentimentColor(article.sentiment)
        }} className="text-xs shrink-0">
              {article.sentiment}
            </Badge>}
        </div>

        

        <div className="flex items-center gap-2">
          <Badge style={{
          backgroundColor: getCategoryColor(article.category)
        }} className="text-primary-foreground">
            {article.category.replace('-', ' ')}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {article.news_sources.name}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {article.excerpt && <p className="text-muted-foreground text-sm line-clamp-3">
            {article.excerpt}
          </p>}

        {showFullContent && article.content && <div className="prose prose-sm max-w-none text-foreground">
            
          </div>}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-4 w-4 text-muted-foreground" />
            {tags.slice(0, 5).map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{tags.length - 5} more
              </Badge>
            )}
          </div>
        )}

        {(article.country_ids?.length > 0 || article.city_ids?.length > 0) && <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>Location-based article</span>
          </div>}

        {article.author && <div className="text-sm text-muted-foreground">
            By {article.author}
          </div>}

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <FavoriteButton itemId={article.id} type="news" />
          </div>
          <Button onClick={handleViewClick} className="flex items-center gap-2" size="sm">
            Read Full Article
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>;
};