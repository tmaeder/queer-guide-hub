import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Heart, 
  MapPin, 
  Calendar, 
  Store, 
  Plane, 
  Users, 
  Shield, 
  ArrowRight,
  CheckCircle,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const Index = () => {
  const { user } = useAuth();
  
  const features = [
    {
      icon: MapPin,
      title: 'Safe Venues',
      description: 'Discover verified queer-friendly venues worldwide',
      color: 'text-primary',
      gradient: 'bg-gradient-to-br from-primary/10 to-primary/5'
    },
    {
      icon: Calendar,
      title: 'Community Events',
      description: 'Connect through local and virtual events',
      color: 'text-secondary',
      gradient: 'bg-gradient-to-br from-secondary/10 to-secondary/5'
    },
    {
      icon: Store,
      title: 'Queer Marketplace',
      description: 'Support LGBTQ+ owned businesses and creators',
      color: 'text-accent',
      gradient: 'bg-gradient-to-br from-accent/10 to-accent/5'
    },
    {
      icon: Plane,
      title: 'Travel Planning',
      description: 'Plan inclusive trips with confidence',
      color: 'text-primary',
      gradient: 'bg-gradient-to-br from-primary/10 to-primary/5'
    },
    {
      icon: Users,
      title: 'Community Hub',
      description: 'Build lasting connections and friendships',
      color: 'text-secondary',
      gradient: 'bg-gradient-to-br from-secondary/10 to-secondary/5'
    },
    {
      icon: Shield,
      title: 'Safe Spaces',
      description: 'Verified inclusive and welcoming environments',
      color: 'text-accent',
      gradient: 'bg-gradient-to-br from-accent/10 to-accent/5'
    }
  ];

  const stats = [
    { number: '10K+', label: 'Verified Venues' },
    { number: '50K+', label: 'Community Members' },
    { number: '200+', label: 'Cities Worldwide' },
    { number: '1K+', label: 'Weekly Events' }
  ];


  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="relative container mx-auto px-4 py-20 lg:py-28">
          <div className="text-center max-w-5xl mx-auto">
            {/* Badge */}
            <Badge variant="secondary" className="mb-6 px-4 py-2">
              <Sparkles className="h-4 w-4 mr-2" />
              Building Safe Communities Since 2024
            </Badge>

            {/* Main Headline */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <Heart className="h-16 w-16 text-primary fill-current animate-pulse" />
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold">
                <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                  Queer Guide
                </span>
              </h1>
            </div>

            {/* Subtitle */}
            <p className="text-xl md:text-2xl lg:text-3xl text-muted-foreground mb-8 max-w-4xl mx-auto leading-relaxed">
              Your comprehensive platform for discovering safe spaces, 
              connecting with community, and building an inclusive world together.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button 
                size="lg" 
                className="text-lg px-8 py-6 bg-gradient-primary hover:opacity-90 shadow-lg hover:shadow-xl transition-all" 
                asChild
              >
                <Link to="/venues">
                  Explore Venues
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg px-8 py-6 hover:bg-primary/10 border-2" 
                asChild
              >
                <Link to={user ? "/events" : "/auth"}>
                  {user ? "Browse Events" : "Join Community"}
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
      <section className="py-20 px-4 bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Everything You Need in 
              <span className="text-primary"> One Place</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Comprehensive tools and resources designed by and for the LGBTQ+ community
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className={`group hover:shadow-2xl transition-all duration-300 animate-fade-in hover:-translate-y-2 border-0 ${feature.gradient}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardContent className="p-8 text-center h-full flex flex-col">
                  <div className={`h-16 w-16 mx-auto mb-6 rounded-full bg-background shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <feature.icon className={`h-8 w-8 ${feature.color}`} />
                  </div>
                  <h3 className="text-2xl font-semibold mb-4">{feature.title}</h3>
                  <p className="text-muted-foreground flex-grow">{feature.description}</p>
                  <Button variant="ghost" size="sm" className="mt-4 group-hover:bg-background/50">
                    Learn More
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-4 bg-gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
        <div className="container mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
            Ready to Build Something Beautiful?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
            Join our growing community of advocates, allies, and changemakers. 
            Together, we're creating a world where everyone belongs.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
            <Button 
              size="lg" 
              variant="secondary"
              className="text-lg px-8 py-6 bg-white text-primary hover:bg-white/90"
              asChild
            >
              <Link to={user ? "/community" : "/auth"}>
                <CheckCircle className="mr-2 h-5 w-5" />
                {user ? "Explore Community" : "Get Started Free"}
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-lg px-8 py-6 border-white text-white hover:bg-white/10"
              asChild
            >
              <Link to="/about">
                Learn Our Story
              </Link>
            </Button>
          </div>

          <div className="flex items-center justify-center gap-6 text-white/80 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Free to join
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Safe & inclusive
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Community-driven
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;