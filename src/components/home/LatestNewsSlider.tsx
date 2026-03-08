import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { useNews } from '@/hooks/useNews';
import { ArrowRight, Calendar, Clock, ExternalLink } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';

const decodeHtmlEntities = (text: string) => {
  if (typeof document === 'undefined') return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

const LatestNewsSlider = React.memo(() => {
  const { articles, loading, error, getFeaturedArticles } = useNews();
  const isMobile = useIsMobile();
  const [featuredArticles, setFeaturedArticles] = useState<any[]>([]);

  // Use getFeaturedArticles() which returns data directly without
  // mutating the shared hook state (avoids race with useNews auto-fetch)
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

  // Use dedicated featured articles if available, else fall back to latest from hook
  const latestArticles = useMemo(
    () => (featuredArticles.length > 0 ? featuredArticles : articles).slice(0, 6),
    [featuredArticles, articles],
  );
  if (loading && featuredArticles.length === 0) {
    return (
      <Box component="section" sx={{ bgcolor: 'background.default', py: isMobile ? 4 : 8, px: 2 }}>
        <Container maxWidth="lg">
          <Box sx={{ mb: isMobile ? 3 : 4 }}>
            <Box
              sx={{
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                height: 32,
                bgcolor: 'action.hover',
                borderRadius: 1,
                width: isMobile ? 192 : 256,
                mb: 2,
              }}
            />
            <Box
              sx={{
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                height: 16,
                bgcolor: 'action.hover',
                borderRadius: 1,
                width: isMobile ? 288 : 384,
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            {Array.from({
              length: isMobile ? 1 : 3,
            }).map((_, i) => (
              <Box key={i} sx={{ width: isMobile ? '100%' : 320 }}>
                <Card style={{ height: 256 }}>
                  <CardContent style={{ padding: 24 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box
                        sx={{
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                          height: 16,
                          bgcolor: 'action.hover',
                          borderRadius: 1,
                        }}
                      />
                      <Box
                        sx={{
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                          height: 12,
                          bgcolor: 'action.hover',
                          borderRadius: 1,
                          width: '75%',
                        }}
                      />
                      <Box
                        sx={{
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                          height: 12,
                          bgcolor: 'action.hover',
                          borderRadius: 1,
                          width: '50%',
                        }}
                      />
                      <Box
                        sx={{
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                          height: 80,
                          bgcolor: 'action.hover',
                          borderRadius: 1,
                        }}
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>
    );
  }
  if (error) {
    return (
      <Box component="section" sx={{ bgcolor: 'background.default', py: isMobile ? 4 : 8, px: 2 }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', py: isMobile ? 4 : 6 }}>
            <Typography variant={isMobile ? 'h6' : 'h5'} sx={{ fontWeight: 700, mb: 2 }}>
              Latest News
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Unable to load news articles at the moment. Please try again later.
            </Typography>
            <Button variant="outline" asChild>
              <Link to="/news">View All News</Link>
            </Button>
          </Box>
        </Container>
      </Box>
    );
  }
  if (latestArticles.length === 0) {
    return null;
  }
  return (
    <Box component="section" sx={{ bgcolor: 'background.default', py: isMobile ? 4 : 8, px: 2 }}>
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: isMobile ? 3 : 4,
          }}
        >
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Calendar
                style={{ width: isMobile ? 20 : 24, height: isMobile ? 20 : 24 }}
                color="var(--mui-palette-primary-main)"
              />
              <Typography variant={isMobile ? 'h6' : 'h4'} sx={{ fontWeight: 700 }}>
                Latest News
              </Typography>
            </Box>
            <Typography variant={isMobile ? 'body2' : 'subtitle1'} color="text.secondary">
              Stay updated with the latest LGBTQ+ news and community updates
            </Typography>
          </Box>
          <Button variant="outline" size={isMobile ? 'sm' : 'default'} asChild>
            <Link to="/news">
              View All
              <ArrowRight
                style={{ marginLeft: 8, width: isMobile ? 12 : 16, height: isMobile ? 12 : 16 }}
              />
            </Link>
          </Button>
        </Box>

        <Carousel
          opts={{
            align: 'start',
            loop: false,
          }}
          style={{ width: '100%' }}
        >
          <CarouselContent style={{ marginLeft: isMobile ? -8 : -16 }}>
            {latestArticles.map((article) => (
              <CarouselItem
                key={article.id}
                style={{ paddingLeft: isMobile ? 8 : 16, flexBasis: isMobile ? '100%' : '33.333%' }}
              >
                <Card
                  sx={{
                    '&:hover': { boxShadow: 6, transform: 'translateY(-4px)' },
                    transition: 'all 300ms',
                  }}
                  style={{ height: '100%' }}
                >
                  <CardContent
                    style={{
                      padding: 24,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <Typography
                      variant={isMobile ? 'body1' : 'subtitle1'}
                      sx={{
                        fontWeight: 600,
                        mb: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        transition: 'color 0.2s',
                      }}
                    >
                      {decodeHtmlEntities(article.title)}
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          color: 'text.secondary',
                        }}
                      >
                        <Clock style={{ width: 16, height: 16, flexShrink: 0 }} />
                        <Typography variant="body2">
                          {format(new Date(article.published_at), 'MMM d, yyyy')}
                        </Typography>
                      </Box>

                      {article.source && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            color: 'text.secondary',
                          }}
                        >
                          <ExternalLink style={{ width: 16, height: 16, flexShrink: 0 }} />
                          <Typography
                            variant="body2"
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {article.source}
                          </Typography>
                        </Box>
                      )}
                    </Box>

                    {article.summary && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          mb: 2,
                          flexGrow: 1,
                        }}
                      >
                        {article.summary}
                      </Typography>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
                      asChild
                    >
                      <Link to={`/news/${article.id}`}>
                        Read More
                        <ArrowRight style={{ marginLeft: 8, width: 12, height: 12 }} />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
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

        {isMobile && latestArticles.length > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {latestArticles.slice(0, 5).map((_, index) => (
                <Box
                  key={index}
                  sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'action.hover' }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Container>
    </Box>
  );
});
LatestNewsSlider.displayName = 'LatestNewsSlider';
export default LatestNewsSlider;
