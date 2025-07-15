import { Heart, Target, Globe, Users, Lightbulb, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function OurVision() {
  const visionPillars = [
    {
      icon: Globe,
      title: "Global Inclusivity",
      description: "A world where LGBTQ+ individuals can find safe, welcoming spaces wherever they are, from major cities to small towns across the globe."
    },
    {
      icon: Users,
      title: "Connected Communities",
      description: "Bridging the gaps between isolated individuals and vibrant communities, fostering meaningful connections and support networks."
    },
    {
      icon: Shield,
      title: "Safety First",
      description: "Creating verified safe spaces where authenticity is celebrated and discrimination has no place, both online and offline."
    },
    {
      icon: Lightbulb,
      title: "Innovation for Good",
      description: "Leveraging technology to solve real problems in the LGBTQ+ community, making resources more accessible and communities stronger."
    }
  ];

  const milestones = [
    {
      year: "2024",
      title: "Foundation",
      description: "The Queer Guide was born from a simple idea: everyone deserves to find their community."
    },
    {
      year: "2025",
      title: "Expansion",
      description: "Growing our platform to serve 50+ cities worldwide with verified safe spaces and events."
    },
    {
      year: "2026",
      title: "Innovation",
      description: "Introducing AI-powered recommendations and advanced safety features for our community."
    },
    {
      year: "2027+",
      title: "Global Impact",
      description: "Becoming the world's most trusted resource for LGBTQ+ individuals seeking community and safety."
    }
  ];

  return (
    <div className="w-full p-6">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Target className="h-12 w-12 text-primary" />
          <h1 className="text-4xl font-bold gradient-text">Our Vision</h1>
        </div>
        <p className="text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
          To create a world where every LGBTQ+ person can live authentically, 
          find their community, and access safe spaces without fear or hesitation.
        </p>
      </div>

      {/* Vision Statement */}
      <section className="mb-16">
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg p-8 mb-8">
          <h2 className="text-3xl font-bold text-center mb-6">The Future We're Building</h2>
          <div className="prose prose-lg max-w-none text-center">
            <p className="text-lg leading-relaxed">
              We envision a future where geography, culture, and circumstance don't determine 
              whether an LGBTQ+ person can find acceptance, support, and community. Through 
              technology, verification, and genuine human connection, we're building bridges 
              that span continents and connect hearts.
            </p>
          </div>
        </div>
      </section>

      {/* Vision Pillars */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Our Vision Pillars</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {visionPillars.map((pillar, index) => (
            <Card key={index} className="h-full">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <pillar.icon className="h-8 w-8 text-primary" />
                  <h3 className="text-xl font-semibold">{pillar.title}</h3>
                </div>
                <p className="text-muted-foreground">{pillar.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* The Problem We're Solving */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">The Challenge</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-primary mb-2">73</div>
              <p className="text-sm text-muted-foreground">Countries where being LGBTQ+ is criminalized</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-primary mb-2">40%</div>
              <p className="text-sm text-muted-foreground">of LGBTQ+ youth have seriously considered suicide</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-primary mb-2">1 in 4</div>
              <p className="text-sm text-muted-foreground">LGBTQ+ individuals experience discrimination</p>
            </CardContent>
          </Card>
        </div>
        <p className="text-center text-muted-foreground mt-6 max-w-3xl mx-auto">
          These statistics drive our mission. Every safe space we verify, every connection we facilitate, 
          and every community we strengthen helps change these numbers for the better.
        </p>
      </section>

      {/* Our Impact Vision */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">The Impact We Envision</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6 text-center">
              <Heart className="h-8 w-8 text-primary mx-auto mb-3" />
              <h4 className="font-semibold mb-2">Reduced Isolation</h4>
              <p className="text-sm text-muted-foreground">
                No LGBTQ+ person should feel alone or unable to find their community
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <Shield className="h-8 w-8 text-primary mx-auto mb-3" />
              <h4 className="font-semibold mb-2">Increased Safety</h4>
              <p className="text-sm text-muted-foreground">
                Verified safe spaces and real community feedback ensure safer experiences
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <Users className="h-8 w-8 text-primary mx-auto mb-3" />
              <h4 className="font-semibold mb-2">Stronger Businesses</h4>
              <p className="text-sm text-muted-foreground">
                LGBTQ+ owned businesses thrive through increased visibility and support
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <Globe className="h-8 w-8 text-primary mx-auto mb-3" />
              <h4 className="font-semibold mb-2">Global Awareness</h4>
              <p className="text-sm text-muted-foreground">
                Raising awareness about LGBTQ+ issues and promoting acceptance worldwide
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Roadmap */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Our Journey Forward</h2>
        <div className="space-y-6">
          {milestones.map((milestone, index) => (
            <div key={index} className="flex items-start gap-4">
              <div className="bg-primary text-primary-foreground rounded-full w-16 h-16 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {milestone.year}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-2">{milestone.title}</h3>
                <p className="text-muted-foreground">{milestone.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Call to Action */}
      <section className="text-center bg-card rounded-lg p-8">
        <h2 className="text-3xl font-bold mb-4">Join Our Vision</h2>
        <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
          This vision becomes reality through community participation. Every venue you add, 
          every event you share, and every connection you make brings us closer to our goal.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Card>
            <CardContent className="p-4 text-center">
              <h4 className="font-semibold mb-1">Be a Pioneer</h4>
              <p className="text-sm text-muted-foreground">Help us map safe spaces in your area</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <h4 className="font-semibold mb-1">Spread the Word</h4>
              <p className="text-sm text-muted-foreground">Share our mission with your networks</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <h4 className="font-semibold mb-1">Give Feedback</h4>
              <p className="text-sm text-muted-foreground">Help us improve and grow together</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}