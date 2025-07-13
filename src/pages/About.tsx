import { Heart, Users, MapPin, Calendar, ShoppingBag, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function About() {
  const features = [
    {
      icon: MapPin,
      title: "LGBTQ+ Friendly Venues",
      description: "Discover safe spaces, restaurants, bars, and businesses that welcome and celebrate the LGBTQ+ community."
    },
    {
      icon: Calendar,
      title: "Community Events",
      description: "Find pride events, social gatherings, support groups, and celebrations happening in your area."
    },
    {
      icon: ShoppingBag,
      title: "Marketplace",
      description: "Support LGBTQ+ owned businesses and find products and services from community members."
    },
    {
      icon: MessageCircle,
      title: "Community Forum",
      description: "Connect with others, share experiences, ask questions, and build meaningful relationships."
    },
    {
      icon: Users,
      title: "Safe Space",
      description: "A moderated platform that prioritizes safety, respect, and inclusivity for all community members."
    }
  ];

  const team = [
    {
      name: "Community Moderators",
      role: "Ensuring a safe and welcoming environment",
      description: "Our volunteer moderators work around the clock to maintain community guidelines and support users."
    },
    {
      name: "Local Ambassadors",
      role: "Building connections worldwide",
      description: "Community leaders who help us understand local needs and promote inclusive spaces in their regions."
    },
    {
      name: "Content Contributors",
      role: "Sharing knowledge and experiences",
      description: "Community members who contribute venue reviews, event information, and valuable resources."
    }
  ];

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Heart className="h-12 w-12 text-primary fill-current" />
          <h1 className="text-4xl font-bold gradient-text">About The Queer Guide</h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          A comprehensive platform connecting the LGBTQ+ community with safe spaces, events, businesses, and each other.
        </p>
      </div>

      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Our Mission</h2>
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg p-8">
          <p className="text-lg text-center leading-relaxed">
            The Queer Guide exists to create a safer, more connected world for LGBTQ+ individuals and allies. 
            We believe everyone deserves to find welcoming spaces, supportive communities, and opportunities 
            to live authentically. Our platform serves as a bridge, connecting people with resources, 
            businesses with customers, and communities with each other.
          </p>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">What We Offer</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="h-full">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <feature.icon className="h-8 w-8 text-primary" />
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                </div>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Our Values</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-2">Inclusivity</h3>
              <p className="text-muted-foreground">
                We welcome all members of the LGBTQ+ community and allies, regardless of identity, 
                background, or experience level.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Safety</h3>
              <p className="text-muted-foreground">
                Creating and maintaining safe spaces is our top priority, both online and in the 
                physical locations we feature.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Community</h3>
              <p className="text-muted-foreground">
                We believe in the power of community and work to foster meaningful connections 
                between individuals and organizations.
              </p>
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-2">Authenticity</h3>
              <p className="text-muted-foreground">
                We encourage everyone to be their authentic selves and provide spaces where 
                that authenticity is celebrated.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Accessibility</h3>
              <p className="text-muted-foreground">
                We strive to make our platform accessible to everyone and highlight venues 
                and events that prioritize accessibility.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Growth</h3>
              <p className="text-muted-foreground">
                We are committed to continuously improving our platform based on community 
                feedback and evolving needs.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Our Community</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {team.map((member, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-2">{member.name}</h3>
                <p className="text-primary font-medium mb-3">{member.role}</p>
                <p className="text-muted-foreground">{member.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Join Our Mission</h2>
        <div className="bg-card rounded-lg p-8 text-center">
          <p className="text-lg mb-6">
            Whether you're looking for safe spaces, wanting to connect with others, or hoping to contribute 
            to the community, The Queer Guide is here for you. Together, we can build a more inclusive world.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">10,000+</p>
              <p className="text-sm text-muted-foreground">Community Members</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">500+</p>
              <p className="text-sm text-muted-foreground">Verified Venues</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">1,000+</p>
              <p className="text-sm text-muted-foreground">Events Listed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">50+</p>
              <p className="text-sm text-muted-foreground">Cities Covered</p>
            </div>
          </div>
        </div>
      </section>

      <section className="text-center">
        <h2 className="text-3xl font-bold mb-4">Get Involved</h2>
        <p className="text-lg text-muted-foreground mb-6">
          Ready to be part of something bigger? There are many ways to contribute to The Queer Guide community.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <h4 className="font-semibold mb-2">Add Venues</h4>
              <p className="text-sm text-muted-foreground">Share LGBTQ+ friendly businesses in your area</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <h4 className="font-semibold mb-2">Create Events</h4>
              <p className="text-sm text-muted-foreground">Organize or promote community gatherings</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <h4 className="font-semibold mb-2">Join Discussions</h4>
              <p className="text-sm text-muted-foreground">Participate in community conversations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <h4 className="font-semibold mb-2">Spread the Word</h4>
              <p className="text-sm text-muted-foreground">Help others discover our community</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}