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
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider').then(module => ({ default: module.LatestNewsSlider })));
const WeeklyEventsSlider = React.lazy(() => import('@/components/home/WeeklyEventsSlider').then(module => ({ default: module.WeeklyEventsSlider })));
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
      <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-muted/20">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5"></div>
        <div className={`relative container mx-auto px-4 ${isMobile ? 'py-16' : 'py-24 lg:py-32'}`}>
          <div className="text-center max-w-6xl mx-auto">
            {/* Badge */}
            <div className="animate-fade-in">
              <Badge variant="secondary" className={`mb-8 ${isMobile ? 'px-4 py-2 text-sm' : 'px-6 py-3 text-base'} bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-all duration-300`}>
                <Sparkles className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} mr-2 animate-pulse`} />
                Building Safe Communities Since 2024
              </Badge>
            </div>

            {/* Main Headline */}
            <div className={`flex items-center justify-center gap-6 mb-10 ${isMobile ? 'flex-col gap-4' : ''} animate-fade-in`} style={{ animationDelay: '0.1s' }}>
              <Heart className={`${isMobile ? 'h-16 w-16' : 'h-20 w-20 lg:h-24 lg:w-24'} text-primary fill-current animate-pulse`} />
              <h1 className={`font-bold tracking-tight ${isMobile ? 'text-5xl' : 'text-7xl md:text-8xl lg:text-9xl'} bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent`}>
                Queer Guide
              </h1>
            </div>

            {/* Subtitle */}
            <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <p className={`text-muted-foreground mb-12 max-w-5xl mx-auto leading-relaxed font-medium ${isMobile ? 'text-xl' : 'text-2xl md:text-3xl lg:text-4xl'}`}>
                Your comprehensive platform for discovering safe spaces, 
                connecting with community, and building an inclusive world together.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className={`flex gap-6 justify-center mb-16 ${isMobile ? 'flex-col' : 'flex-col sm:flex-row'} animate-fade-in`} style={{ animationDelay: '0.3s' }}>
              <Button size={isMobile ? "lg" : "lg"} className={`${isMobile ? 'text-lg px-8 py-6 h-14' : 'text-xl px-12 py-8 h-16'} bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 group`} asChild>
                <Link to="/venues">
                  Explore Venues
                  <ArrowRight className={`ml-3 ${isMobile ? 'h-5 w-5' : 'h-6 w-6'} group-hover:translate-x-1 transition-transform`} />
                </Link>
              </Button>
              <Button size={isMobile ? "lg" : "lg"} variant="outline" className={`${isMobile ? 'text-lg px-8 py-6 h-14' : 'text-xl px-12 py-8 h-16'} hover:bg-muted border-2 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 group border-primary/20 hover:border-primary/40`} asChild>
                <Link to={user ? "/events" : "/auth"}>
                  {user ? "Browse Events" : "Join Community"}
                  <ArrowRight className={`ml-3 ${isMobile ? 'h-5 w-5' : 'h-6 w-6'} group-hover:translate-x-1 transition-transform`} />
                </Link>
              </Button>
            </div>

            {/* Stats */}
            <div className={`grid gap-8 max-w-4xl mx-auto ${isMobile ? 'grid-cols-2 gap-6' : 'grid-cols-2 md:grid-cols-4 gap-12'} animate-fade-in`} style={{ animationDelay: '0.4s' }}>
              {stats.map((stat, index) => (
                <div key={index} className="text-center group">
                  <div className={`font-bold text-primary mb-3 transition-all duration-300 group-hover:scale-110 ${isMobile ? 'text-3xl' : 'text-4xl md:text-5xl lg:text-6xl'}`}>
                    {stat.number}
                  </div>
                  <div className={`text-muted-foreground font-medium ${isMobile ? 'text-sm' : 'text-base md:text-lg'}`}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className={`bg-gradient-to-b from-muted/10 to-background ${isMobile ? 'py-16' : 'py-24'} px-4`}>
        <div className="container mx-auto">
          <div className={`text-center ${isMobile ? 'mb-12' : 'mb-20'}`}>
            <h2 className={`font-bold mb-8 tracking-tight ${isMobile ? 'text-3xl' : 'text-5xl md:text-6xl lg:text-7xl'}`}>
              Everything You Need in 
              <span className="text-primary bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent"> One Place</span>
            </h2>
            <p className={`text-muted-foreground max-w-4xl mx-auto font-medium leading-relaxed ${isMobile ? 'text-lg' : 'text-xl md:text-2xl'}`}>
              Comprehensive tools and resources designed by and for the LGBTQ+ community
            </p>
          </div>

          <div className={`grid gap-8 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10'}`}>
            {features.map((feature, index) => (
              <Card key={index} className="group hover:shadow-2xl transition-all duration-500 animate-fade-in hover:-translate-y-4 bg-card/80 backdrop-blur-sm border-border/50 hover:border-primary/20 overflow-hidden" style={{
                animationDelay: `${index * 150}ms`
              }}>
                <CardContent className={`text-center h-full flex flex-col relative ${isMobile ? 'p-8' : 'p-10'}`}>
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
                  
                  <div className={`mx-auto mb-8 rounded-full bg-gradient-to-br from-background to-muted border-2 border-border group-hover:border-primary/30 flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-lg group-hover:shadow-xl ${isMobile ? 'h-16 w-16' : 'h-20 w-20'}`}>
                    <feature.icon className={`${feature.color} ${isMobile ? 'h-8 w-8' : 'h-10 w-10'} transition-all duration-300 group-hover:scale-110`} />
                  </div>
                  
                  <h3 className={`font-bold mb-6 group-hover:text-primary transition-colors duration-300 ${isMobile ? 'text-xl' : 'text-2xl md:text-3xl'}`}>
                    {feature.title}
                  </h3>
                  
                  <p className={`text-muted-foreground flex-grow mb-8 leading-relaxed ${isMobile ? 'text-base' : 'text-lg'}`}>
                    {feature.description}
                  </p>
                  
                  <Button variant="ghost" size={isMobile ? "default" : "lg"} className="mt-auto group-hover:bg-primary/10 group-hover:text-primary transition-all duration-300 hover:scale-105" asChild>
                    <Link to={feature.link}>
                      Learn More
                      <ArrowRight className={`ml-2 ${isMobile ? 'h-4 w-4' : 'h-5 w-5'} group-hover:translate-x-1 transition-transform`} />
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
      <section className={`bg-gradient-to-b from-background to-muted/10 ${isMobile ? 'py-16' : 'py-24'} px-4`}>
        <div className="container mx-auto">
          <div className={`text-center ${isMobile ? 'mb-12' : 'mb-20'}`}>
            <h2 className={`font-bold mb-8 tracking-tight ${isMobile ? 'text-3xl' : 'text-5xl md:text-6xl lg:text-7xl'}`}>
              What Our Community Says
            </h2>
            <p className={`text-muted-foreground max-w-4xl mx-auto font-medium leading-relaxed ${isMobile ? 'text-lg' : 'text-xl md:text-2xl'}`}>
              Real stories from LGBTQ+ individuals who've found connection and support
            </p>
          </div>

          <div className={`grid gap-10 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`}>
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="bg-card/80 backdrop-blur-sm border-border/50 hover:border-primary/20 hover:shadow-2xl transition-all duration-500 group animate-fade-in" style={{ animationDelay: `${index * 200}ms` }}>
                <CardContent className={`${isMobile ? 'p-8' : 'p-10'} relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-primary/10 to-transparent rounded-bl-full"></div>
                  
                  <Quote className={`${isMobile ? 'h-8 w-8' : 'h-10 w-10'} text-primary mb-6 group-hover:scale-110 transition-transform duration-300`} />
                  
                  <p className={`text-foreground mb-8 leading-relaxed font-medium ${isMobile ? 'text-base' : 'text-lg'}`}>
                    "{testimonial.quote}"
                  </p>
                  
                  <div className="flex items-center gap-4">
                    <div className={`${isMobile ? 'h-12 w-12' : 'h-14 w-14'} rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border-2 border-primary/10 group-hover:border-primary/30 transition-all duration-300`}>
                      <Users className={`${isMobile ? 'h-6 w-6' : 'h-7 w-7'} text-primary`} />
                    </div>
                    <div>
                      <div className={`font-bold text-foreground ${isMobile ? 'text-base' : 'text-lg'}`}>
                        {testimonial.author}
                      </div>
                      <div className={`text-muted-foreground font-medium ${isMobile ? 'text-sm' : 'text-base'}`}>
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
      <section className={`bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground relative overflow-hidden ${isMobile ? 'py-16' : 'py-24'} px-4`}>
        <div className="absolute inset-0 bg-gradient-to-r from-accent/10 via-transparent to-primary/20"></div>
        <div className="absolute top-0 left-0 w-full h-full opacity-10">
          <div className="absolute top-10 left-10 w-20 h-20 bg-primary-foreground rounded-full animate-pulse"></div>
          <div className="absolute bottom-20 right-20 w-16 h-16 bg-primary-foreground/50 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/4 w-12 h-12 bg-primary-foreground/30 rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
        
        <div className="container mx-auto relative">
          <div className="text-center max-w-5xl mx-auto">
            <h2 className={`font-bold mb-8 tracking-tight ${isMobile ? 'text-3xl' : 'text-5xl md:text-6xl lg:text-7xl'}`}>
              Ready to Join Our Community?
            </h2>
            <p className={`mb-12 opacity-90 font-medium leading-relaxed max-w-3xl mx-auto ${isMobile ? 'text-lg' : 'text-xl md:text-2xl'}`}>
              Connect with like-minded individuals, discover safe spaces, and help build a more inclusive world together.
            </p>
            <div className={`flex gap-6 justify-center ${isMobile ? 'flex-col' : 'flex-col sm:flex-row'}`}>
              <Button size={isMobile ? "lg" : "lg"} variant="secondary" className={`${isMobile ? 'text-lg px-8 py-6 h-14' : 'text-xl px-12 py-8 h-16'} bg-primary-foreground text-primary hover:bg-primary-foreground/90 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 group font-semibold`} asChild>
                <Link to="/auth">
                  Get Started Today
                  <ArrowRight className={`ml-3 ${isMobile ? 'h-5 w-5' : 'h-6 w-6'} group-hover:translate-x-1 transition-transform`} />
                </Link>
              </Button>
              <Button size={isMobile ? "lg" : "lg"} variant="outline" className={`${isMobile ? 'text-lg px-8 py-6 h-14' : 'text-xl px-12 py-8 h-16'} border-2 border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 group font-semibold`} asChild>
                <Link to="/venues">
                  Explore Venues
                  <Search className={`ml-3 ${isMobile ? 'h-5 w-5' : 'h-6 w-6'} group-hover:scale-110 transition-transform`} />
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