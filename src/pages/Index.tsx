import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, MapPin, Calendar, Store, Plane, Users, Shield, ArrowRight, CheckCircle, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useStats } from '@/hooks/useStats';
import { useIsMobile } from '@/hooks/use-mobile';
const Index = () => {
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
    title: 'Safe Venues',
    description: 'Discover verified queer-friendly venues worldwide',
    color: 'text-primary',
    gradient: 'bg-gradient-to-br from-primary/10 to-primary/5'
  }, {
    icon: Calendar,
    title: 'Community Events',
    description: 'Connect through local and virtual events',
    color: 'text-secondary',
    gradient: 'bg-gradient-to-br from-secondary/10 to-secondary/5'
  }, {
    icon: Store,
    title: 'Queer Marketplace',
    description: 'Support LGBTQ+ owned businesses and creators',
    color: 'text-accent',
    gradient: 'bg-gradient-to-br from-accent/10 to-accent/5'
  }, {
    icon: Plane,
    title: 'Travel Planning',
    description: 'Plan inclusive trips with confidence',
    color: 'text-primary',
    gradient: 'bg-gradient-to-br from-primary/10 to-primary/5'
  }, {
    icon: Users,
    title: 'Community Hub',
    description: 'Build lasting connections and friendships',
    color: 'text-secondary',
    gradient: 'bg-gradient-to-br from-secondary/10 to-secondary/5'
  }, {
    icon: Shield,
    title: 'Safe Spaces',
    description: 'Verified inclusive and welcoming environments',
    color: 'text-accent',
    gradient: 'bg-gradient-to-br from-accent/10 to-accent/5'
  }];
  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${Math.floor(num / 1000)}K+`;
    }
    return num.toString();
  };
  const stats = loading ? [{
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
  }];
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
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
                <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                  Queer Guide
                </span>
              </h1>
            </div>

            {/* Subtitle */}
            <p className={`text-muted-foreground mb-8 max-w-4xl mx-auto leading-relaxed ${
              isMobile ? 'text-lg' : 'text-xl md:text-2xl lg:text-3xl'
            }`}>
              Your comprehensive platform for discovering safe spaces, 
              connecting with community, and building an inclusive world together.
            </p>

            {/* CTA Buttons */}
            <div className={`flex gap-4 justify-center mb-12 ${isMobile ? 'flex-col' : 'flex-col sm:flex-row'}`}>
              <Button 
                size={isMobile ? "default" : "lg"} 
                className={`${isMobile ? 'text-base px-6 py-6 h-12' : 'text-lg px-8 py-6'} bg-gradient-primary hover:opacity-90 shadow-lg hover:shadow-xl transition-all`} 
                asChild
              >
                <Link to="/venues">
                  Explore Venues
                  <ArrowRight className={`ml-2 ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                </Link>
              </Button>
              <Button 
                size={isMobile ? "default" : "lg"} 
                variant="outline" 
                className={`${isMobile ? 'text-base px-6 py-6 h-12' : 'text-lg px-8 py-6'} hover:bg-primary/10 border-2`} 
                asChild
              >
                <Link to={user ? "/events" : "/auth"}>
                  {user ? "Browse Events" : "Join Community"}
                </Link>
              </Button>
            </div>

            {/* Stats */}
            <div className={`grid gap-8 max-w-3xl mx-auto ${isMobile ? 'grid-cols-2 gap-4' : 'grid-cols-2 md:grid-cols-4'}`}>
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className={`font-bold text-primary mb-2 ${isMobile ? 'text-2xl' : 'text-3xl md:text-4xl'}`}>
                    {stat.number}
                  </div>
                  <div className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className={`bg-gradient-to-b from-background to-muted/20 ${isMobile ? 'py-12' : 'py-20'} px-4`}>
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
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className={`group hover:shadow-2xl transition-all duration-300 animate-fade-in hover:-translate-y-2 border-0 ${feature.gradient}`} 
                style={{
                  animationDelay: `${index * 100}ms`
                }}
              >
                <CardContent className={`text-center h-full flex flex-col ${isMobile ? 'p-6' : 'p-8'}`}>
                  <div className={`mx-auto mb-6 rounded-full bg-background shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform ${
                    isMobile ? 'h-12 w-12' : 'h-16 w-16'
                  }`}>
                    <feature.icon className={`${feature.color} ${isMobile ? 'h-6 w-6' : 'h-8 w-8'}`} />
                  </div>
                  <h3 className={`font-semibold mb-4 ${isMobile ? 'text-lg' : 'text-2xl'}`}>
                    {feature.title}
                  </h3>
                  <p className={`text-muted-foreground flex-grow ${isMobile ? 'text-sm' : ''}`}>
                    {feature.description}
                  </p>
                  <Button variant="ghost" size="sm" className="mt-4 group-hover:bg-background/50">
                    Learn More
                    <ArrowRight className={`ml-2 ${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      
    </div>
  );
};

export default Index;