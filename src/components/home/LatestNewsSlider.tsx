import React, { useEffect, useMemo, useState } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { useNews } from '@/hooks/useNews';
import { ArrowRight, Clock } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const decodeHtmlEntities = (text: string) => {
  if (typeof document === 'undefined') return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text; // safe: textarea cannot execute scripts
  return textarea.value;
};

const LatestNewsSlider = React.memo(() => {
  const { articles, loading, error, getFeaturedArticles } = useNews();
  const isMobile = useIsMobile();
  const [featuredArticles, setFeaturedArticles] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadFeatured = async () => {
      try {
        const data = await getFeaturedArticles();
        if (!cancelled) setFeaturedArticles(data);
      } catch (error) {
        console.warn('Failed to load featured news:', error);
      }
    };
    loadFeatured();
    return () => {
      cancelled = true;
    };
  }, [getFeaturedArticles]);

  const latestArticles = useMemo(
    () => (featuredArticles.length > 0 ? featuredArticles : articles).slice(0, 6),
    [featuredArticles, articles],
  );

  if (loading && featuredArticles.length === 0) {
    return (
      <Box component="section" sx={{ py: { xs: 4, md: 8 }, px: { xs: 2, sm: 3, md: 4 } }}>
        <Box sx={{ mb: { xs: 3, md: 4 } }}>
          <Box
            sx={{
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              height: 32,
              bgcolor: 'action.hover',
              width: { xs: 192, md: 256 },
              mb: 2,
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {Array.from({ length: isMobile ? 1 : 3 }).map((_, i) => (
            <Box key={i} sx={{ flex: 1 }}>
              <Card style={{ height: 200 }}>
                <CardContent style={{ padding: 24 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', height: 16, bgcolor: 'action.hover' }} />
                    <Box sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', height: 12, bgcolor: 'action.hover', width: '75%' }} />
                    <Box sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', height: 60, bgcolor: 'action.hover' }} />
                  </Box>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  if (error || latestArticles.length === 0) return null;

  return (
    <Box component="section" sx={{ py: { xs: 4, md: 8 }, px: { xs: 2, sm: 3, md: 4 } }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: { xs: 3, md: 4 },
        }}
      >
        <Typography
          variant="h2"
          sx={{
            fontWeight: 800,
            fontSize: { xs: '1.75rem', md: '2.25rem' },
          }}
        >
          Latest News
        </Typography>
        <Button variant="outline" size={isMobile ? 'sm' : 'default'} asChild>
          <LocalizedLink to="/news">
            View All
            <ArrowRight style={{ marginLeft: 8, width: isMobile ? 12 : 16, height: isMobile ? 12 : 16 }} />
          </LocalizedLink>
        </Button>
      </Box>

      <Carousel
        opts={{ align: 'start', loop: false }}
        style={{ width: '100%' }}
      >
        <CarouselContent style={{ marginLeft: isMobile ? -8 : -16 }}>
          {latestArticles.map((article) => (
            <CarouselItem
              key={article.id}
              style={{ paddingLeft: isMobile ? 8 : 16, flexBasis: isMobile ? '85%' : '33.333%' }}
            >
              <LocalizedLink
                to={`/news/${article.slug}`}
                style={{ textDecoration: 'none', display: 'block', height: '100%' }}
              >
                {/* Image */}
                {article.image_url && (
                  <Box
                    sx={{
                      width: '100%',
                      aspectRatio: '16/9',
                      overflow: 'hidden',
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Box
                      component="img"
                      src={article.image_url}
                      alt=""
                      sx={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        transition: 'opacity 0.2s',
                        '&:hover': { opacity: 0.85 },
                      }}
                    />
                  </Box>
                )}

                <Card style={{ height: '100%' }}>
                  <CardContent
                    style={{
                      padding: isMobile ? 16 : 20,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {/* Source + date */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                      {article.source && (
                        <>
                          <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {article.source}
                          </Typography>
                          <Typography variant="caption" sx={{ opacity: 0.4 }}>{'·'}</Typography>
                        </>
                      )}
                      <Typography variant="caption">
                        {format(new Date(article.published_at), 'MMM d, yyyy')}
                      </Typography>
                    </Box>

                    {/* Title */}
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: { xs: '0.9375rem', md: '1.0625rem' },
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        color: 'text.primary',
                        lineHeight: 1.4,
                      }}
                    >
                      {decodeHtmlEntities(article.title)}
                    </Typography>

                    {/* Summary */}
                    {article.summary && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.secondary',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.5,
                        }}
                      >
                        {article.summary}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </LocalizedLink>
            </CarouselItem>
          ))}
        </CarouselContent>

        {!isMobile && latestArticles.length > 3 && (
          <>
            <CarouselPrevious style={{ display: 'flex' }} />
            <CarouselNext style={{ display: 'flex' }} />
          </>
        )}
      </Carousel>
    </Box>
  );
});
LatestNewsSlider.displayName = 'LatestNewsSlider';
export default LatestNewsSlider;
