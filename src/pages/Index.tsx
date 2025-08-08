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
  const {
    user
  } = useAuth();
  const {
    stats: realStats,
    loading
  } = useStats();
  const isMobile = useIsMobile();
  const features = [{
    icon: MapPin,
    title: 'Safe Spaces That Slap',
    description: 'Find verified queer havens where you can be your authentic self',
    color: 'text-primary',
    link: '/venues'
  }, {
    icon: Calendar,
    title: 'Events That Serve',
    description: 'Connect with your people through fab local & virtual gatherings',
    color: 'text-foreground',
    link: '/events'
  }, {
    icon: Store,
    title: 'Queer Marketplace',
    description: 'Support our community - shop queer-owned businesses & creators',
    color: 'text-accent',
    link: '/marketplace'
  }, {
    icon: Plane,
    title: 'Travel Like a Queen',
    description: 'Plan trips to places that celebrate you - no compromises',
    color: 'text-primary',
    link: '/travel'
  }, {
    icon: Users,
    title: 'Find Your Chosen Family',
    description: 'Build real connections with people who get you',
    color: 'text-foreground',
    link: '/groups'
  }, {
    icon: BookOpen,
    title: 'The Tea & Resources',
    description: 'Stay informed about rights, culture, and community wisdom',
    color: 'text-accent',
    link: '/directory'
  }];
  const testimonials = [{
    quote: "Queer Guide helped me find my people when I moved cities. This app is literally life-changing!",
    author: "Alex",
    location: "Berlin, Germany"
  }, {
    quote: "Being featured on Queer Guide brought so much love to my queer-owned business. The community support hits different!",
    author: "Sam",
    location: "San Francisco, USA"
  }, {
    quote: "The events section keeps me plugged into the scene. It's giving main character energy and I'm here for it!",
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
              Your go-to spot for finding safe spaces, connecting with chosen family, 
              and living your most authentic life. Welcome home, bestie!
            </p>

            {/* CTA Buttons */}
            <div className="flex gap-4 justify-center mb-16 flex-col sm:flex-row">
              <Button size="lg" className="text-lg px-8 py-6" asChild>
                <Link to="/venues">
                  Find Safe Spaces
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6" asChild>
                <Link to={user ? "/events" : "/auth"}>
                  {user ? "Hit the Scene" : "Join the Family"}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
              {stats.map((stat, index) => <div key={index} className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-primary mb-2">
                    {stat.number}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                </div>)}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Everything That Serves
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              All the tools and resources your queer heart desires
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {})}
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
      

      {/* Final CTA Section */}
      
    </div>;
});

// Enhanced skeleton component for lazy-loaded sliders
const SliderSkeleton = ({
  title
}: {
  title: string;
}) => {
  const isMobile = useIsMobile();
  return <section className={`bg-gradient-to-b from-muted/5 to-background ${isMobile ? 'py-12' : 'py-20'} px-4`}>
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
          {Array.from({
          length: isMobile ? 2 : 3
        }).map((_, i) => <Card key={i} className="h-80 bg-card/50 border-border/50 animate-pulse">
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
            </Card>)}
        </div>
      </div>
    </section>;
};
export default Index;