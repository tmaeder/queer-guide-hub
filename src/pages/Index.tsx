import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, MapPin, Calendar, Store, Plane, Users, Shield, ArrowRight, CheckCircle, Sparkles, Globe, Search, BookOpen, Quote } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useStats } from '@/hooks/useStats';
import { useIsMobile } from '@/hooks/use-mobile';

// Lazy load slider components for better performance
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const WeeklyEventsSlider = React.lazy(() => import('@/components/home/WeeklyEventsSlider'));
const Index = React.memo(() => {
  const { user } = useAuth();
  const { stats: realStats, loading } = useStats();
  const isMobile = useIsMobile();
  const features = [{
    icon: MapPin,
    title: 'Safe Venues',
    description: 'Discover verified queer-friendly venues worldwide',
    color: 'text-primary',
    link: '/venues'
  }, {
    icon: Calendar,
    title: 'Community Events',
    description: 'Connect through local and virtual events',
    color: 'text-foreground',
    link: '/events'
  }, {
    icon: Store,
    title: 'Queer Marketplace',
    description: 'Support LGBTQ+ owned businesses and creators',
    color: 'text-accent',
    link: '/marketplace'
  }, {
    icon: Plane,
    title: 'Travel Planning',
    description: 'Plan inclusive trips with confidence',
    color: 'text-primary',
    link: '/travel'
  }, {
    icon: Users,
    title: 'Community Hub',
    description: 'Build lasting connections and friendships',
    color: 'text-foreground',
    link: '/groups'
  }, {
    icon: BookOpen,
    title: 'Knowledge Base',
    description: 'Learn about LGBTQ+ rights and resources',
    color: 'text-accent',
    link: '/directory'
  }];
  const testimonials = [{
    quote: "Queer Guide helped me find safe spaces when I moved to a new city. The community here is amazing!",
    author: "Alex",
    location: "Berlin, Germany"
  }, {
    quote: "As a business owner, being featured on Queer Guide has connected me with my community.",
    author: "Sam",
    location: "San Francisco, USA"
  }, {
    quote: "The events section keeps me connected with local LGBTQ+ happenings. It's become essential.",
    author: "Jordan",
    location: "Toronto, Canada"
  }];
  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${Math.floor(num / 1000)}K+`;
    }
    return num.toString();
  };

  const stats = useMemo(() => loading ? [{
    number: '---',
    label: 'Verified Venues'
  }, {
    number: '---',
    label: 'Community Members'
  }, {
    number: '---',
    label: 'Cities Worldwide'
  }, {
    number: '---',
    label: 'Weekly Events'
  }] : [{
    number: formatNumber(realStats.venues),
    label: 'Verified Venues'
  }, {
    number: formatNumber(realStats.members),
    label: 'Community Members'
  }, {
    number: formatNumber(realStats.cities),
    label: 'Cities Worldwide'
  }, {
    number: formatNumber(realStats.weeklyEvents),
    label: 'Weekly Events'
  }], [loading, realStats, formatNumber]);
  return <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-24 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-4xl mx-auto">
            {/* Main Headline */}
            <div className="flex items-center justify-center gap-6 mb-8">
              <Heart className="h-16 w-16 lg:h-20 lg:w-20 text-primary fill-current" />
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold">
                Queer Guide
              </h1>
            </div>

            {/* Subtitle */}
            <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto">
              Your platform for discovering safe spaces, connecting with community, 
              and building an inclusive world together.
            </p>

            {/* CTA Buttons */}
            <div className="flex gap-4 justify-center mb-16 flex-col sm:flex-row">
              <Button size="lg" className="text-lg px-8 py-6" asChild>
                <Link to="/venues">
                  Explore Venues
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6" asChild>
                <Link to={user ? "/events" : "/auth"}>
                  {user ? "Browse Events" : "Join Community"}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-primary mb-2">
                    {stat.number}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Everything You Need
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Comprehensive tools and resources for the LGBTQ+ community
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow duration-200">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                    <feature.icon className="h-8 w-8 text-primary" />
                  </div>
                  
                  <h3 className="text-xl font-bold mb-4">
                    {feature.title}
                  </h3>
                  
                  <p className="text-muted-foreground mb-6">
                    {feature.description}
                  </p>
                  
                  <Button variant="ghost" asChild>
                    <Link to={feature.link}>
                      Learn More
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Weekly Events Near You */}
      <React.Suspense fallback={<SliderSkeleton title="This Week Near You" />}>
        <WeeklyEventsSlider />
      </React.Suspense>

      {/* Latest News Section */}
      <React.Suspense fallback={<SliderSkeleton title="Latest News" />}>
        <LatestNewsSlider />
      </React.Suspense>

      {/* Testimonials Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              What Our Community Says
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Real stories from LGBTQ+ individuals
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow duration-200">
                <CardContent className="p-8">
                  <Quote className="h-8 w-8 text-primary mb-6" />
                  
                  <p className="text-foreground mb-6 leading-relaxed">
                    "{testimonial.quote}"
                  </p>
                  
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="font-bold">
                        {testimonial.author}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {testimonial.location}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to Join Our Community?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Connect with like-minded individuals and discover safe spaces.
            </p>
            <div className="flex gap-4 justify-center flex-col sm:flex-row">
              <Button size="lg" variant="secondary" className="text-lg px-8 py-6" asChild>
                <Link to="/auth">
                  Get Started Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10" asChild>
                <Link to="/venues">
                  Explore Venues
                  <Search className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>;
});

// Enhanced skeleton component for lazy-loaded sliders
const SliderSkeleton = ({ title }: { title: string }) => {
  const isMobile = useIsMobile();
  return (
    <section className={`bg-gradient-to-b from-muted/5 to-background ${isMobile ? 'py-12' : 'py-20'} px-4`}>
      <div className="container mx-auto">
        <div className={`${isMobile ? 'mb-8' : 'mb-12'}`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className={`h-10 bg-gradient-to-r from-muted via-muted/70 to-muted rounded-lg animate-pulse ${isMobile ? 'w-56' : 'w-80'} mb-4`}></div>
              <div className={`h-6 bg-gradient-to-r from-muted/70 via-muted/50 to-muted/70 rounded animate-pulse ${isMobile ? 'w-80' : 'w-96'}`}></div>
            </div>
            <div className={`h-10 bg-muted rounded-lg animate-pulse ${isMobile ? 'w-24' : 'w-32'}`}></div>
          </div>
        </div>
        
        <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
          {Array.from({ length: isMobile ? 2 : 3 }).map((_, i) => (
            <Card key={i} className="h-80 bg-card/50 border-border/50 animate-pulse">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="h-6 bg-gradient-to-r from-muted to-muted/70 rounded w-20 animate-pulse"></div>
                    <div className="h-6 bg-gradient-to-r from-muted/70 to-muted rounded w-16 animate-pulse"></div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-7 bg-gradient-to-r from-muted via-muted/80 to-muted rounded animate-pulse"></div>
                    <div className="h-7 bg-gradient-to-r from-muted/80 via-muted to-muted/80 rounded w-3/4 animate-pulse"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 bg-muted rounded animate-pulse"></div>
                      <div className="h-4 bg-muted rounded w-24 animate-pulse"></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 bg-muted rounded animate-pulse"></div>
                      <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gradient-to-r from-muted/60 to-muted/40 rounded animate-pulse"></div>
                    <div className="h-4 bg-gradient-to-r from-muted/40 to-muted/60 rounded w-5/6 animate-pulse"></div>
                    <div className="h-4 bg-gradient-to-r from-muted/60 to-muted/40 rounded w-2/3 animate-pulse"></div>
                  </div>
                  <div className="h-10 bg-muted rounded-lg animate-pulse mt-auto"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Index;