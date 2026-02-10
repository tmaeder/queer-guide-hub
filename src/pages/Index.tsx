import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, MapPin, Calendar, Store, Plane, Users, Shield, ArrowRight, CheckCircle, Sparkles, Globe, Search, BookOpen, Quote, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';
import { useIsMobile } from '@/hooks/use-mobile';


const FrontPageVenueMap = React.lazy(() => import('@/components/home/FrontPageVenueMap'));
const VenueMapSearch = React.lazy(() => import('@/components/venues/VenueMapSearch').then(m => ({ default: m.VenueMapSearch })));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const WeeklyEventsSlider = React.lazy(() => import('@/components/home/WeeklyEventsSlider'));
const RegionalEventsCalendar = React.lazy(() => import('@/components/home/RegionalEventsCalendar'));
const Index = React.memo(() => {
  const {
    user
  } = useAuth();
  const {
    stats: realStats,
    loading
  } = useConsolidatedStats();
  const isMobile = useIsMobile();
  const features = [{
    icon: MapPin,
    title: 'Venues',
    description: 'Find verified queer-friendly venues where you can be yourself',
    color: 'text-primary',
    link: '/venues'
  }, {
    icon: Calendar,
    title: 'Events',
    description: 'Discover local and virtual gatherings in your area',
    color: 'text-foreground',
    link: '/events'
  }, {
    icon: Store,
    title: 'Marketplace',
    description: 'Support queer-owned businesses and creators',
    color: 'text-accent',
    link: '/marketplace'
  }, {
    icon: Plane,
    title: 'Places',
    description: 'Explore queer-friendly cities and countries worldwide',
    color: 'text-primary',
    link: '/places'
  }, {
    icon: Users,
    title: 'Community',
    description: 'Connect with like-minded people and join groups',
    color: 'text-foreground',
    link: '/groups'
  }, {
    icon: BookOpen,
    title: 'Resources',
    description: 'Learn about rights, culture, and community topics',
    color: 'text-accent',
    link: '/resources'
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
    number: formatNumber(realStats.profiles),
    label: 'Community Members'
  }, {
    number: formatNumber(realStats.cities),
    label: 'Cities Worldwide'
  }, {
    number: formatNumber(realStats.events),
    label: 'Weekly Events'
  }], [loading, realStats, formatNumber]);
  return <div className="min-h-screen">
      {/* Find Venues & Restrooms Near You */}
      <section>
        <div className="container mx-auto px-4 py-8 md:py-12">
          <VenueMapSearch />
        </div>
      </section>

      {/* Hero Section */}
      <section>
        <FrontPageVenueMap fullWidth heightClass="h-[60vh]" />
      </section>

      {/* Features Grid */}
      <section>
        <div className="container mx-auto px-4 py-16 md:py-20">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon as any;
              return (
                <Link to={feature.link} key={index} className="block focus:outline-none focus:ring-2 focus:ring-primary rounded-lg">
                  <Card className="h-full shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-0.5 border-border/50">
                    <CardContent className="p-5">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="p-2.5 rounded-lg bg-primary/10">
                          <Icon className="h-6 w-6 md:h-7 md:w-7 text-primary" aria-hidden="true" />
                        </div>
                        <h3 className="text-sm md:text-base font-semibold">{feature.title}</h3>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Community Stats */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center space-y-1">
                <p className="text-3xl md:text-4xl font-bold font-montserrat gradient-text">
                  {stat.number}
                </p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Weekly Events Near You */}
      <React.Suspense fallback={<SliderSkeleton title="This Week Near You" />}>
        <WeeklyEventsSlider />
      </React.Suspense>

      {/* Regional Events Calendar */}
      <React.Suspense fallback={<SliderSkeleton title="Events Calendar Near You" />}>
        <RegionalEventsCalendar />
      </React.Suspense>

      {/* Latest News Section */}
      <React.Suspense fallback={<SliderSkeleton title="Latest News" />}>
        <LatestNewsSlider />
      </React.Suspense>

      {/* Testimonials */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold font-montserrat text-center mb-10">
            Voices from the Community
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="border-border/50 shadow-card">
                <CardContent className="p-6 space-y-4">
                  <Quote className="h-6 w-6 text-primary/40" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-muted-foreground italic">
                    "{testimonial.quote}"
                  </p>
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-sm font-semibold">{testimonial.author}</p>
                    <p className="text-xs text-muted-foreground">{testimonial.location}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>;
});

// Enhanced skeleton component for lazy-loaded sliders
const SliderSkeleton = ({
  title
}: {
  title: string;
}) => {
  const isMobile = useIsMobile();
  return <section className={`bg-muted/5 ${isMobile ? 'py-12' : 'py-20'} px-4`}>
      <div className="container mx-auto">
        <div className={`${isMobile ? 'mb-8' : 'mb-12'}`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className={`h-10 bg-muted rounded-lg animate-pulse ${isMobile ? 'w-56' : 'w-80'} mb-4`}></div>
              <div className={`h-6 bg-muted rounded-lg animate-pulse ${isMobile ? 'w-80' : 'w-96'}`}></div>
            </div>
            <div className={`h-10 bg-muted rounded-lg animate-pulse ${isMobile ? 'w-24' : 'w-32'}`}></div>
          </div>
        </div>
        
        <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
          {Array.from({
          length: isMobile ? 2 : 3
        }).map((_, i) => <Card key={i} className="h-80 bg-card/50 animate-pulse">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="h-6 bg-muted rounded-lg w-20 animate-pulse"></div>
                    <div className="h-6 bg-muted rounded-lg w-16 animate-pulse"></div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-7 bg-muted rounded-lg animate-pulse"></div>
                    <div className="h-7 bg-muted rounded-lg w-3/4 animate-pulse"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 bg-muted rounded-lg animate-pulse"></div>
                      <div className="h-4 bg-muted rounded-lg w-24 animate-pulse"></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 bg-muted rounded-lg animate-pulse"></div>
                      <div className="h-4 bg-muted rounded-lg w-32 animate-pulse"></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded-lg animate-pulse"></div>
                    <div className="h-4 bg-muted rounded-lg w-5/6 animate-pulse"></div>
                    <div className="h-4 bg-muted rounded-lg w-2/3 animate-pulse"></div>
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