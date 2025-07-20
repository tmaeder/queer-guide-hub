import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Eye, Calendar, MapPin, Tag, Newspaper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Tables } from "@/integrations/supabase/types";
import { Link } from "react-router-dom";
import { FavoriteButton } from "@/components/ui/favorite-button";

type NewsArticle = Tables<'news_articles'> & {
  news_sources: Tables<'news_sources'>;
};

interface NewsCardProps {
  article: NewsArticle;
  onViewArticle?: (articleId: string) => void;
  showFullContent?: boolean;
  viewMode?: 'grid' | 'list';
}

export const NewsCard = ({ article, onViewArticle, showFullContent = false, viewMode = 'grid' }: NewsCardProps) => {
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
      case 'positive': return 'hsl(var(--success))';
      case 'negative': return 'hsl(var(--destructive))';
      default: return 'hsl(var(--muted))';
    }
  };

  if (viewMode === 'list') {
    return (
      <Card className="group hover:shadow-md transition-all duration-300">
        <CardContent className="p-4">
          <div className="flex gap-4">
            {article.image_url && (
              <div className="relative w-32 h-24 shrink-0 overflow-hidden rounded-lg">
                <img
                  src={article.image_url}
                  alt={article.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {article.is_featured && (
                  <Badge className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs">
                    Featured
                  </Badge>
                )}
              </div>
            )}
            
            <div className="flex-1 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors">
                  {article.title}
                </h3>
                {article.sentiment && (
                  <Badge 
                    variant="outline" 
                    style={{ borderColor: getSentimentColor(article.sentiment) }}
                    className="text-xs shrink-0"
                  >
                    {article.sentiment}
                  </Badge>
                )}
              </div>

              {article.excerpt && (
                <p className="text-muted-foreground text-sm line-clamp-2">
                  {article.excerpt}
                </p>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
                  </div>
                  {article.views_count > 0 && (
                    <div className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      {article.views_count}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {article.tags && article.tags.length > 0 ? (
                    article.tags.slice(0, 2).map((tag, index) => (
                      <Badge 
                        key={index}
                        variant="secondary"
                        className="text-xs"
                      >
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <Badge 
                      style={{ backgroundColor: getCategoryColor(article.category) }}
                      className="text-primary-foreground text-xs"
                    >
                      {article.category.replace('-', ' ')}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    <Newspaper className="h-3 w-3 mr-1" />
                    {new URL(article.url).hostname.replace('www.', '')}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <FavoriteButton itemId={article.id} type="news" />
                <Button
                  onClick={handleViewClick}
                  className="flex items-center gap-2"
                  size="sm"
                >
                  Read Article
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 animate-fade-in">
      <CardHeader className="space-y-3">
        {article.image_url && (
          <div className="relative overflow-hidden rounded-lg">
            <img
              src={article.image_url}
              alt={article.title}
              className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {article.is_featured && (
              <Badge 
                className="absolute top-2 left-2 bg-primary text-primary-foreground"
              >
                Featured
              </Badge>
            )}
          </div>
        )}
        
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors">
            {article.title}
          </h3>
          {article.sentiment && (
            <Badge 
              variant="outline" 
              style={{ borderColor: getSentimentColor(article.sentiment) }}
              className="text-xs shrink-0"
            >
              {article.sentiment}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
          </div>
          {article.views_count > 0 && (
            <div className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              {article.views_count}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {article.tags && article.tags.length > 0 ? (
            article.tags.slice(0, 3).map((tag, index) => (
              <Badge 
                key={index}
                variant="secondary"
                className="text-xs"
              >
                <Tag className="h-3 w-3 mr-1" />
                {tag}
              </Badge>
            ))
          ) : (
            <Badge 
              style={{ backgroundColor: getCategoryColor(article.category) }}
              className="text-primary-foreground text-xs"
            >
              {article.category.replace('-', ' ')}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            <Newspaper className="h-3 w-3 mr-1" />
            {new URL(article.url).hostname.replace('www.', '')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {article.excerpt && (
          <p className="text-muted-foreground text-sm line-clamp-3">
            {article.excerpt}
          </p>
        )}

        {showFullContent && article.content && (
          <div className="prose prose-sm max-w-none text-foreground">
            <p>{article.content}</p>
          </div>
        )}

        {(article.country_ids?.length > 0 || article.city_ids?.length > 0) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>Location-based article</span>
          </div>
        )}

        {article.author && (
          <div className="text-sm text-muted-foreground">
            By {article.author}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <FavoriteButton itemId={article.id} type="news" />
          </div>
          <Button
            onClick={handleViewClick}
            className="flex items-center gap-2 hover-scale"
            size="sm"
          >
            Read Full Article
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};