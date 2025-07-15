import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Heart, MapPin, Calendar, Store, Plane, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { VenueMapSearch } from '@/components/venues/VenueMapSearch';

const Index = () => {
  const { user } = useAuth();
  
  const features = [
    {
      icon: MapPin,
      title: 'Venue Directory',
      description: 'Discover queer-friendly venues in your area',
      color: 'text-primary'
    },
    {
      icon: Calendar,
      title: 'Events Calendar',
      description: 'Find and share community events',
      color: 'text-accent'
    },
    {
      icon: Store,
      title: 'Marketplace',
      description: 'Support queer-owned businesses',
      color: 'text-secondary'
    },
    {
      icon: Plane,
      title: 'Travel Planner',
      description: 'Plan safe and inclusive travel',
      color: 'text-primary'
    },
    {
      icon: Users,
      title: 'Community Hub',
      description: 'Connect with your community',
      color: 'text-accent'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="w-full text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Heart className="h-12 w-12 text-primary fill-current" />
            <h1 className="text-5xl md:text-6xl font-bold gradient-text">
              Queer Guide
            </h1>
          </div>
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Your comprehensive platform for discovering queer-friendly venues, 
            connecting with community, and building safe spaces together.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-gradient-primary hover:opacity-90 text-lg px-8" asChild>
              <Link to="/venues">Explore Venues</Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8" asChild>
              <Link to={user ? "/community" : "/auth"}>
                {user ? "Join Community" : "Sign Up"}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Venue Map Search */}
      <section className="py-16 px-4">
        <div className="w-full">
          <VenueMapSearch />
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-4">
        <div className="w-full">
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything You Need in One Place
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="group hover:shadow-elegant transition-all duration-300 animate-fade-in">
                <CardContent className="p-6 text-center">
                  <feature.icon className={`h-12 w-12 mx-auto mb-4 ${feature.color} group-hover:scale-110 transition-transform`} />
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 bg-card/30">
        <div className="w-full text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Connect with Your Community?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of community members who are building a more inclusive world together.
          </p>
          <Button size="lg" className="bg-gradient-primary hover:opacity-90 text-lg px-8">
            Get Started Today
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Index;
