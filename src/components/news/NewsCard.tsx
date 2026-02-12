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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
  const [isLoadingTags, setIsLoadingTags] = useState(false);

  useEffect(() => {
    const fetchTags = async () => {
      if (!article.id) return;

      setIsLoadingTags(true);
      try {
        const { data, error } = await supabase
          .from('unified_tag_assignments')
          .select('unified_tags!inner(name, color)')
          .eq('entity_type', 'news')
          .eq('entity_id', article.id);

        if (error) {
          console.warn('Failed to fetch tags for article:', error);
          return;
        }

        if (data) {
          const tagNames = data.map((item: any) => item.unified_tags.name);
          setTags(tagNames);
        }
      } catch (error) {
        console.warn('Error fetching tags:', error);
      } finally {
        setIsLoadingTags(false);
      }
    };

    fetchTags();
  }, [article.id]);
  const handleViewClick = () => {
    onViewArticle?.(article.id);
    window.open(article.url, '_blank');
  };
  const decodeHtmlEntities = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  const getCategoryColor = (_category: string) => {
    return '#555555';
  };
  return <Card style={{ boxShadow: 'var(--shadow-card)', transition: 'all 0.3s', borderColor: 'rgba(var(--border-rgb, 0,0,0), 0.5)' }}>
      <CardHeader style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {article.image_url && <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2 }}>
            <img src={article.image_url} alt={article.title} style={{ width: '100%', height: 192, objectFit: 'cover', transition: 'transform 0.3s' }} />
            {article.is_featured && <Badge style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#333333', color: '#ffffff' }}>
                Featured
              </Badge>}
          </Box>}

        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.125rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {decodeHtmlEntities(article.title)}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Badge style={{
          backgroundColor: getCategoryColor(article.category),
          color: '#ffffff'
        }}>
            {article.category.replace('-', ' ')}
          </Badge>
          <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
            {article.news_sources.name}
          </Badge>
        </Box>
      </CardHeader>

      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {article.excerpt && <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {article.excerpt}
          </Typography>}

        {showFullContent && article.content && <Box sx={{ maxWidth: 'none', color: 'var(--foreground)' }}>

          </Box>}

        {/* Tags */}
        {isLoadingTags ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tag style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Box sx={{ height: 16, width: 64, bgcolor: 'var(--muted)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', borderRadius: '9999px' }} />
              <Box sx={{ height: 16, width: 48, bgcolor: 'var(--muted)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', borderRadius: '9999px' }} />
            </Box>
          </Box>
        ) : tags.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Tag style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            {tags.slice(0, 5).map(tag => (
              <Badge key={tag} variant="outline" style={{ fontSize: '0.75rem' }}>
                {tag}
              </Badge>
            ))}
            {tags.length > 5 && (
              <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                +{tags.length - 5} more
              </Badge>
            )}
          </Box>
        )}

        {(article.country_ids?.length > 0 || article.city_ids?.length > 0) && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
            <MapPin style={{ height: 16, width: 16 }} />
            <span>Location-based article</span>
          </Box>}

        {article.author && <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
            By {article.author}
          </Typography>}

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FavoriteButton itemId={article.id} type="news" />
          </Box>
          <Button onClick={handleViewClick} style={{ display: 'flex', alignItems: 'center', gap: 8 }} size="sm">
            Read Full Article
            <ExternalLink style={{ height: 16, width: 16 }} />
          </Button>
        </Box>
      </CardContent>
    </Card>;
};
