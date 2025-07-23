import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { NewsCard } from '@/components/news/NewsCard';
import { useNews } from '@/hooks/useNews';
import { ArrowRight, Calendar } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

export const LatestNewsSlider = () => {
  const { articles, loading, error, fetchArticles } = useNews();
  const isMobile = useIsMobile();

  useEffect(() => {
    const loadNews = async () => {
      try {
        await fetchArticles();
      } catch (error) {
        console.warn('Failed to load news articles:', error);
      }
    };
    
    loadNews();
  }, [fetchArticles]);

  if (loading) {
    return (
      <section className={`bg-muted/10 ${isMobile ? 'py-12' : 'py-20'} px-4`}>
        <div className="container mx-auto">
          <div className={`flex items-center justify-between ${isMobile ? 'mb-8' : 'mb-12'}`}>
            <div>
              <h2 className={`font-bold mb-2 ${isMobile ? 'text-2xl' : 'text-3xl md:text-4xl'}`}>
                Latest News
              </h2>
              <p className={`text-muted-foreground ${isMobile ? 'text-sm' : 'text-lg'}`}>
                Stay updated with the latest LGBTQ+ news and stories
              </p>
            </div>
            <Button variant="outline" asChild className={isMobile ? 'px-3' : ''}>
              <Link to="/news">
                View All
                <ArrowRight className={`ml-2 ${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
              </Link>
            </Button>
          </div>
          
          <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
            {Array.from({ length: isMobile ? 2 : 3 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-40 bg-muted rounded-lg mb-4"></div>
                  <div className="h-4 bg-muted rounded mb-2"></div>
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || !articles.length) {
    return null;
  }

  return (
    <section className={`bg-muted/10 ${isMobile ? 'py-12' : 'py-20'} px-4`}>
      <div className="container mx-auto">
        <div className={`flex items-center justify-between ${isMobile ? 'mb-8' : 'mb-12'}`}>
          <div>
            <h2 className={`font-bold mb-2 ${isMobile ? 'text-2xl' : 'text-3xl md:text-4xl'}`}>
              Latest News
            </h2>
            <p className={`text-muted-foreground ${isMobile ? 'text-sm' : 'text-lg'}`}>
              Stay updated with the latest LGBTQ+ news and stories
            </p>
          </div>
          <Button variant="outline" asChild className={isMobile ? 'px-3' : ''}>
            <Link to="/news">
              View All
              <ArrowRight className={`ml-2 ${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
            </Link>
          </Button>
        </div>

        <div className="relative">
          <Carousel
            opts={{
              align: "start",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-2 md:-ml-4">
              {articles.map((article, index) => (
                <CarouselItem key={article.id} className={`pl-2 md:pl-4 ${isMobile ? 'basis-full' : 'basis-full md:basis-1/2 lg:basis-1/3'}`}>
                  <div className="h-full">
                    <NewsCard 
                      article={article} 
                      showFullContent={false}
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {!isMobile && (
              <>
                <CarouselPrevious className="absolute -left-12 top-1/2" />
                <CarouselNext className="absolute -right-12 top-1/2" />
              </>
            )}
          </Carousel>
        </div>

        {/* Mobile navigation dots */}
        {isMobile && (
          <div className="flex justify-center mt-6 space-x-2">
            {Array.from({ length: Math.ceil(articles.length / 1) }).map((_, index) => (
              <div
                key={index}
                className="w-2 h-2 rounded-full bg-muted-foreground/30"
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};