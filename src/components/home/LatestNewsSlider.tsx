import React, { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { useNews } from '@/hooks/useNews';
import { ArrowRight, Calendar, Clock, ExternalLink } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
const LatestNewsSlider = React.memo(() => {
  const {
    articles,
    loading,
    error,
    fetchArticles
  } = useNews();
  const isMobile = useIsMobile();
  useEffect(() => {
    const loadNews = async () => {
      try {
        await fetchArticles({
          featured: true
        });
      } catch (error) {
        console.warn('Failed to load news articles:', error);
      }
    };
    if (articles.length === 0) {
      loadNews();
    }
  }, [fetchArticles, articles.length]);
  const latestArticles = useMemo(() => articles.slice(0, 6), [articles]);
  if (loading) {
    return <section className={`bg-background ${isMobile ? 'py-8' : 'py-16'} px-4`}>
        <div className="container mx-auto">
          <div className={`${isMobile ? 'mb-6' : 'mb-8'}`}>
            <div className={`h-8 bg-muted rounded animate-pulse ${isMobile ? 'w-48' : 'w-64'} mb-4`}></div>
            <div className={`h-4 bg-muted rounded animate-pulse ${isMobile ? 'w-72' : 'w-96'}`}></div>
          </div>
          <div className="flex gap-4">
            {Array.from({
            length: isMobile ? 1 : 3
          }).map((_, i) => <div key={i} className={`${isMobile ? 'w-full' : 'w-80'}`}>
                <Card className="h-64">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="h-4 bg-muted rounded animate-pulse"></div>
                      <div className="h-3 bg-muted rounded animate-pulse w-3/4"></div>
                      <div className="h-3 bg-muted rounded animate-pulse w-1/2"></div>
                      <div className="h-20 bg-muted rounded animate-pulse"></div>
                    </div>
                  </CardContent>
                </Card>
              </div>)}
          </div>
        </div>
      </section>;
  }
  if (error) {
    return <section className={`bg-background ${isMobile ? 'py-8' : 'py-16'} px-4`}>
        <div className="container mx-auto">
          <div className={`text-center ${isMobile ? 'py-8' : 'py-12'}`}>
            <h2 className={`font-bold mb-4 ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              Latest News
            </h2>
            <p className="text-muted-foreground mb-6">
              Unable to load news articles at the moment. Please try again later.
            </p>
            <Button variant="outline" asChild>
              <Link to="/news">View All News</Link>
            </Button>
          </div>
        </div>
      </section>;
  }
  if (latestArticles.length === 0) {
    return <section className={`bg-background ${isMobile ? 'py-8' : 'py-16'} px-4`}>
        <div className="container mx-auto">
          <div className={`text-center ${isMobile ? 'py-8' : 'py-12'}`}>
            <h2 className={`font-bold mb-4 ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              Latest News
            </h2>
            <p className="text-muted-foreground mb-6">
              No news articles available yet. Check back soon for updates!
            </p>
            <Button variant="outline" asChild>
              <Link to="/news">Explore News Section</Link>
            </Button>
          </div>
        </div>
      </section>;
  }
  return <section className={`bg-background ${isMobile ? 'py-8' : 'py-16'} px-4`}>
      <div className="container mx-auto">
        <div className={`flex items-center justify-between ${isMobile ? 'mb-6' : 'mb-8'}`}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className={`${isMobile ? 'h-5 w-5' : 'h-6 w-6'} text-primary`} />
              <h2 className={`font-bold ${isMobile ? 'text-xl' : 'text-3xl'}`}>
                Latest News
              </h2>
            </div>
            <p className={`text-muted-foreground ${isMobile ? 'text-sm' : 'text-lg'}`}>
              Stay updated with the latest LGBTQ+ news and community updates
            </p>
          </div>
          <Button variant="outline" size={isMobile ? "sm" : "default"} asChild>
            <Link to="/news">
              View All
              <ArrowRight className={`ml-2 ${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
            </Link>
          </Button>
        </div>

        <Carousel opts={{
        align: "start",
        loop: false
      }} className="w-full">
          <CarouselContent className="-ml-2 md:-ml-4">
            {latestArticles.map(article => <CarouselItem key={article.id} className={`pl-2 md:pl-4 ${isMobile ? 'basis-full' : 'basis-full md:basis-1/2 lg:basis-1/3'}`}>
                <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full">
                  <CardContent className="p-6 h-full flex flex-col">
                    
                    
                    <h3 className={`font-semibold mb-3 line-clamp-2 group-hover:text-primary transition-colors ${isMobile ? 'text-base' : 'text-lg'}`}>
                      {article.title}
                    </h3>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm">
                          {format(new Date(article.published_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                      
                      {article.source && <div className="flex items-center gap-2 text-muted-foreground">
                          <ExternalLink className="h-4 w-4 flex-shrink-0" />
                          <span className="text-sm truncate">
                            {article.source}
                          </span>
                        </div>}
                    </div>

                    {article.summary && <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-grow">
                        {article.summary}
                      </p>}

                    <Button variant="ghost" size="sm" className="mt-auto self-start group-hover:bg-muted/50" asChild>
                      <Link to={`/news/${article.id}`}>
                        Read More
                        <ArrowRight className="ml-2 h-3 w-3" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </CarouselItem>)}
          </CarouselContent>
          
          {!isMobile && latestArticles.length > 3 && <>
              <CarouselPrevious className="hidden md:flex" />
              <CarouselNext className="hidden md:flex" />
            </>}
        </Carousel>

        {isMobile && latestArticles.length > 1 && <div className="flex justify-center mt-4">
            <div className="flex space-x-2">
              {latestArticles.slice(0, 5).map((_, index) => <div key={index} className="w-2 h-2 rounded-full bg-muted" />)}
            </div>
          </div>}
      </div>
    </section>;
});
LatestNewsSlider.displayName = 'LatestNewsSlider';
export default LatestNewsSlider;