import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, MapPin, Calendar, Store, Plane, Users, Shield, ArrowRight, CheckCircle, Sparkles, Globe, Search, BookOpen, Quote } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useStats } from '@/hooks/useStats';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSEO, generateOrganizationStructuredData } from '@/hooks/useSEO';

// Lazy load slider components for better performance
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider').then(module => ({ default: module.LatestNewsSlider })));
const WeeklyEventsSlider = React.lazy(() => import('@/components/home/WeeklyEventsSlider').then(module => ({ default: module.WeeklyEventsSlider })));
const Index = React.memo(() => {
  const { user } = useAuth();
  
  // SEO optimization for homepage
  useSEO({
    title: "Queer Guide - LGBTQ+ Community & Safe Spaces Worldwide",
    description: "Discover queer-friendly venues, events, businesses, and connect with the LGBTQ+ community worldwide. Find safe spaces, local events, and inclusive businesses.",
    keywords: "LGBTQ+, queer, gay, lesbian, bisexual, transgender, safe spaces, queer venues, LGBTQ events, gay bars, inclusive businesses, pride events, LGBTQ travel",
    url: "https://queerguide.app/",
    structuredData: generateOrganizationStructuredData()
  });
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
      <section className="relative overflow-hidden bg-background">
        <div className="absolute inset-0 opacity-5"></div>
        <div className={`relative container mx-auto px-4 ${isMobile ? 'py-12' : 'py-20 lg:py-28'}`}>
          <div className="text-center max-w-5xl mx-auto">
            {/* Badge */}
            <Badge variant="secondary" className={`mb-6 ${isMobile ? 'px-3 py-1 text-xs' : 'px-4 py-2'}`}>
              <Sparkles className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} mr-2`} />
              Building Safe Communities Since 2024
            </Badge>

            {/* Main Headline */}
            <div className={`flex items-center justify-center gap-4 mb-8 ${isMobile ? 'flex-col gap-2' : ''}`}>
              <Heart className={`${isMobile ? 'h-12 w-12' : 'h-16 w-16'} text-primary fill-current animate-pulse`} />
              <h1 className={`font-bold ${isMobile ? 'text-4xl' : 'text-6xl md:text-7xl lg:text-8xl'}`}>
                <span className="text-foreground">
                  Queer Guide
                </span>
              </h1>
            </div>

            {/* Subtitle */}
            <p className={`text-muted-foreground mb-8 max-w-4xl mx-auto leading-relaxed ${isMobile ? 'text-lg' : 'text-xl md:text-2xl lg:text-3xl'}`}>
              Your comprehensive platform for discovering safe spaces, 
              connecting with community, and building an inclusive world together.
            </p>

            {/* CTA Buttons */}
            <div className={`flex gap-4 justify-center mb-12 ${isMobile ? 'flex-col' : 'flex-col sm:flex-row'}`}>
              <Button size={isMobile ? "default" : "lg"} className={`${isMobile ? 'text-base px-6 py-6 h-12' : 'text-lg px-8 py-6'} bg-primary hover:bg-primary/90 transition-all`} asChild>
                <Link to="/venues">
                  Explore Venues
                  <ArrowRight className={`ml-2 ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                </Link>
              </Button>
              <Button size={isMobile ? "default" : "lg"} variant="outline" className={`${isMobile ? 'text-base px-6 py-6 h-12' : 'text-lg px-8 py-6'} hover:bg-muted border-2`} asChild>
                <Link to={user ? "/events" : "/auth"}>
                  {user ? "Browse Events" : "Join Community"}
                </Link>
              </Button>
            </div>

            {/* Stats */}
            <div className={`grid gap-8 max-w-3xl mx-auto ${isMobile ? 'grid-cols-2 gap-4' : 'grid-cols-2 md:grid-cols-4'}`}>
              {stats.map((stat, index) => <div key={index} className="text-center">
                  <div className={`font-bold text-primary mb-2 ${isMobile ? 'text-2xl' : 'text-3xl md:text-4xl'}`}>
                    {stat.number}
                  </div>
                  <div className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    {stat.label}
                  </div>
                </div>)}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className={`bg-muted/20 ${isMobile ? 'py-12' : 'py-20'} px-4`}>
        <div className="container mx-auto">
          <div className={`text-center ${isMobile ? 'mb-8' : 'mb-16'}`}>
            <h2 className={`font-bold mb-6 ${isMobile ? 'text-2xl' : 'text-4xl md:text-5xl'}`}>
              Everything You Need in 
              <span className="text-primary"> One Place</span>
            </h2>
            <p className={`text-muted-foreground max-w-3xl mx-auto ${isMobile ? 'text-base' : 'text-xl'}`}>
              Comprehensive tools and resources designed by and for the LGBTQ+ community
            </p>
          </div>

          <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'}`}>
            {features.map((feature, index) => <Card key={index} className="group hover:shadow-lg transition-all duration-300 animate-fade-in hover:-translate-y-2 bg-card border-border" style={{
            animationDelay: `${index * 100}ms`
          }}>
                <CardContent className={`text-center h-full flex flex-col ${isMobile ? 'p-6' : 'p-8'}`}>
                  <div className={`mx-auto mb-6 rounded-full bg-background border border-border flex items-center justify-center group-hover:scale-110 transition-transform ${isMobile ? 'h-12 w-12' : 'h-16 w-16'}`}>
                    <feature.icon className={`${feature.color} ${isMobile ? 'h-6 w-6' : 'h-8 w-8'}`} />
                  </div>
                  <h3 className={`font-semibold mb-4 ${isMobile ? 'text-lg' : 'text-2xl'}`}>
                    {feature.title}
                  </h3>
                  <p className={`text-muted-foreground flex-grow ${isMobile ? 'text-sm' : ''}`}>
                    {feature.description}
                  </p>
                  <Button variant="ghost" size="sm" className="mt-4 group-hover:bg-muted/50" asChild>
                    <Link to={feature.link}>
                      Learn More
                      <ArrowRight className={`ml-2 ${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
                    </Link>
                  </Button>
                </CardContent>
              </Card>)}
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
      <section className={`bg-background ${isMobile ? 'py-12' : 'py-20'} px-4`}>
        <div className="container mx-auto">
          <div className={`text-center ${isMobile ? 'mb-8' : 'mb-16'}`}>
            <h2 className={`font-bold mb-6 ${isMobile ? 'text-2xl' : 'text-4xl md:text-5xl'}`}>
              What Our Community Says
            </h2>
            <p className={`text-muted-foreground max-w-3xl mx-auto ${isMobile ? 'text-base' : 'text-xl'}`}>
              Real stories from LGBTQ+ individuals who've found connection and support
            </p>
          </div>

          <div className={`grid gap-8 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`}>
            {testimonials.map((testimonial, index) => <Card key={index} className="bg-card border-border">
                <CardContent className={`${isMobile ? 'p-6' : 'p-8'}`}>
                  <Quote className={`${isMobile ? 'h-6 w-6' : 'h-8 w-8'} text-primary mb-4`} />
                  <p className={`text-foreground mb-6 ${isMobile ? 'text-sm' : 'text-base'}`}>
                    "{testimonial.quote}"
                  </p>
                  <div className="flex items-center gap-3">
                    <div className={`${isMobile ? 'h-10 w-10' : 'h-12 w-12'} rounded-full bg-muted flex items-center justify-center`}>
                      <Users className={`${isMobile ? 'h-5 w-5' : 'h-6 w-6'} text-muted-foreground`} />
                    </div>
                    <div>
                      <div className={`font-semibold ${isMobile ? 'text-sm' : 'text-base'}`}>
                        {testimonial.author}
                      </div>
                      <div className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>
                        {testimonial.location}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>)}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className={`bg-primary text-primary-foreground ${isMobile ? 'py-12' : 'py-20'} px-4`}>
        <div className="container mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <h2 className={`font-bold mb-6 ${isMobile ? 'text-2xl' : 'text-4xl md:text-5xl'}`}>
              Ready to Join Our Community?
            </h2>
            <p className={`mb-8 opacity-90 ${isMobile ? 'text-base' : 'text-xl'}`}>
              Connect with like-minded individuals, discover safe spaces, and help build a more inclusive world.
            </p>
            <div className={`flex gap-4 justify-center ${isMobile ? 'flex-col' : 'flex-col sm:flex-row'}`}>
              <Button size={isMobile ? "default" : "lg"} variant="secondary" className={`${isMobile ? 'text-base px-6 py-6 h-12' : 'text-lg px-8 py-6'} bg-primary-foreground text-primary hover:bg-primary-foreground/90`} asChild>
                <Link to="/auth">
                  Get Started Today
                  <ArrowRight className={`ml-2 ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                </Link>
              </Button>
              <Button size={isMobile ? "default" : "lg"} variant="outline" className={`${isMobile ? 'text-base px-6 py-6 h-12' : 'text-lg px-8 py-6'} border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10`} asChild>
                <Link to="/venues">
                  Explore Venues
                  <Search className={`ml-2 ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>;
});

// Skeleton component for lazy-loaded sliders
const SliderSkeleton = ({ title }: { title: string }) => {
  const isMobile = useIsMobile();
  return (
    <section className={`bg-muted/10 ${isMobile ? 'py-8' : 'py-16'} px-4`}>
      <div className="container mx-auto">
        <div className={`${isMobile ? 'mb-6' : 'mb-8'}`}>
          <div className={`h-8 bg-muted rounded animate-pulse ${isMobile ? 'w-48' : 'w-64'} mb-4`}></div>
          <div className={`h-4 bg-muted rounded animate-pulse ${isMobile ? 'w-72' : 'w-96'}`}></div>
        </div>
        <div className="flex gap-4">
          {Array.from({ length: isMobile ? 1 : 3 }).map((_, i) => (
            <div key={i} className={`${isMobile ? 'w-full' : 'w-80'}`}>
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Index;