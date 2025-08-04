import { useState } from "react";
import { Heart, Target, Star, Leaf, Users, MapPin, Calendar, ShoppingBag, MessageCircle, Shield, Globe, Lightbulb, Award, Handshake, TreePine, Recycle, Sun, Droplets, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export default function AboutHub() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    about: false,
    vision: false,
    values: false,
    sustainability: false
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

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
    }
  ];

  const coreValues = [
    {
      icon: Heart,
      title: "Love & Acceptance",
      description: "We believe love is love, and everyone deserves to be accepted for who they are."
    },
    {
      icon: Shield,
      title: "Safety & Security", 
      description: "The safety of our community members is our highest priority with rigorous verification processes."
    },
    {
      icon: Users,
      title: "Community First",
      description: "We put community needs before profit, evaluating every decision through the lens of community benefit."
    },
    {
      icon: Globe,
      title: "Global Inclusivity",
      description: "Our platform welcomes people from all backgrounds, cultures, and locations worldwide."
    }
  ];

  const sustainabilityInitiatives = [
    {
      icon: TreePine,
      title: "Carbon Neutral Events",
      description: "Partner with venues committed to carbon-neutral practices and support offset programs."
    },
    {
      icon: Recycle,
      title: "Waste Reduction",
      description: "Promoting zero-waste events, reusable materials, and comprehensive recycling programs."
    },
    {
      icon: Sun,
      title: "Renewable Energy",
      description: "Supporting venues that use renewable energy sources and promoting clean energy adoption."
    },
    {
      icon: Droplets,
      title: "Water Conservation",
      description: "Implementing water-saving practices and promoting conservation awareness in our community."
    }
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Heart className="h-12 w-12 text-primary fill-current animate-pulse" />
          <h1 className="text-4xl font-bold gradient-text">About The Queer Guide</h1>
        </div>
        <p className="text-muted-foreground text-lg">
          Learn about our mission, values, vision, and commitment to sustainability
        </p>
      </div>

      <div className="space-y-6">
        {/* About Us */}
        <Card>
          <Collapsible open={openSections.about} onOpenChange={() => toggleSection('about')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Heart className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <CardTitle>About Us</CardTitle>
                      <CardDescription>Our mission and what we offer to the community</CardDescription>
                    </div>
                  </div>
                  {openSections.about ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="prose prose-slate dark:prose-invert max-w-none">
                <section className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-3">Our Mission</h3>
                    <p>The Queer Guide exists to create a safer, more connected world for LGBTQ+ individuals and allies. We believe everyone deserves to find welcoming spaces, supportive communities, and opportunities to live authentically.</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">What We Offer</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {features.map((feature, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <feature.icon className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                          <div>
                            <h4 className="font-medium">{feature.title}</h4>
                            <p className="text-sm text-muted-foreground">{feature.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </section>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Our Vision */}
        <Card>
          <Collapsible open={openSections.vision} onOpenChange={() => toggleSection('vision')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Target className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <CardTitle>Our Vision</CardTitle>
                      <CardDescription>The future we're building for the LGBTQ+ community</CardDescription>
                    </div>
                  </div>
                  {openSections.vision ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="prose prose-slate dark:prose-invert max-w-none">
                <section className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-3">The Future We're Building</h3>
                    <p>To create a world where every LGBTQ+ person can live authentically, find their community, and access safe spaces without fear or hesitation.</p>
                    <p>We envision a future where geography, culture, and circumstance don't determine whether an LGBTQ+ person can find acceptance, support, and community.</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Vision Pillars</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium flex items-center gap-2">
                          <Globe className="h-5 w-5 text-primary" />
                          Global Inclusivity
                        </h4>
                        <p className="text-sm text-muted-foreground">Safe, welcoming spaces wherever you are, from major cities to small towns across the globe.</p>
                      </div>
                      <div>
                        <h4 className="font-medium flex items-center gap-2">
                          <Users className="h-5 w-5 text-primary" />
                          Connected Communities
                        </h4>
                        <p className="text-sm text-muted-foreground">Bridging gaps between isolated individuals and vibrant communities.</p>
                      </div>
                      <div>
                        <h4 className="font-medium flex items-center gap-2">
                          <Shield className="h-5 w-5 text-primary" />
                          Safety First
                        </h4>
                        <p className="text-sm text-muted-foreground">Verified safe spaces where authenticity is celebrated and discrimination has no place.</p>
                      </div>
                      <div>
                        <h4 className="font-medium flex items-center gap-2">
                          <Lightbulb className="h-5 w-5 text-primary" />
                          Innovation for Good
                        </h4>
                        <p className="text-sm text-muted-foreground">Leveraging technology to solve real problems and make resources more accessible.</p>
                      </div>
                    </div>
                  </div>

                </section>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Our Values */}
        <Card>
          <Collapsible open={openSections.values} onOpenChange={() => toggleSection('values')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Star className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <CardTitle>Our Values</CardTitle>
                      <CardDescription>The principles that guide every decision we make</CardDescription>
                    </div>
                  </div>
                  {openSections.values ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="prose prose-slate dark:prose-invert max-w-none">
                <section className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-3">Core Values</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {coreValues.map((value, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <value.icon className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                          <div>
                            <h4 className="font-medium">{value.title}</h4>
                            <p className="text-sm text-muted-foreground">{value.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">How We Operate</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <h4 className="font-medium flex items-center gap-2">
                          <Award className="h-5 w-5 text-primary" />
                          Transparency
                        </h4>
                        <p className="text-sm text-muted-foreground">Open communication about our policies, decisions, and operations.</p>
                      </div>
                      <div>
                        <h4 className="font-medium flex items-center gap-2">
                          <Handshake className="h-5 w-5 text-primary" />
                          Collaboration
                        </h4>
                        <p className="text-sm text-muted-foreground">Working together with community organizations and local businesses.</p>
                      </div>
                      <div>
                        <h4 className="font-medium flex items-center gap-2">
                          <Heart className="h-5 w-5 text-primary" />
                          Empathy
                        </h4>
                        <p className="text-sm text-muted-foreground">Understanding and sharing the experiences of our community members.</p>
                      </div>
                    </div>
                  </div>

                </section>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Sustainability */}
        <Card>
          <Collapsible open={openSections.sustainability} onOpenChange={() => toggleSection('sustainability')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Leaf className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <CardTitle>Sustainability</CardTitle>
                      <CardDescription>Our commitment to environmental responsibility</CardDescription>
                    </div>
                  </div>
                  {openSections.sustainability ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="prose prose-slate dark:prose-invert max-w-none">
                <section className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-3">Our Environmental Commitment</h3>
                    <p>We believe that caring for our planet is essential to creating safe and thriving spaces for our community. Building a sustainable future through environmental responsibility and mindful practices.</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Green Initiatives</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {sustainabilityInitiatives.map((initiative, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <initiative.icon className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                          <div>
                            <h4 className="font-medium">{initiative.title}</h4>
                            <p className="text-sm text-muted-foreground">{initiative.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>


                  <div>
                    <h3 className="text-xl font-semibold mb-3">Additional Commitments</h3>
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium">Community Gardens</h4>
                        <p className="text-sm text-muted-foreground">Supporting LGBTQ+ community gardens and urban farming initiatives.</p>
                      </div>
                      <div>
                        <h4 className="font-medium">Green Transportation</h4>
                        <p className="text-sm text-muted-foreground">Encouraging sustainable transportation to events and supporting EV charging.</p>
                      </div>
                    </div>
                  </div>
                </section>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>

      {/* Contact Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-center">Get in Touch</CardTitle>
          <CardDescription className="text-center">
            Questions about our mission, values, or sustainability efforts?
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">General Inquiries</h4>
              <p className="text-sm text-muted-foreground">hello@thequeerguide.com</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Values & Feedback</h4>
              <p className="text-sm text-muted-foreground">values@thequeerguide.com</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}