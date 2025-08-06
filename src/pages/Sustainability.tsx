import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Leaf, Recycle, Heart, TreePine, Sun, Droplets } from 'lucide-react';

export default function Sustainability() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative py-20 px-4">
        <div className="container mx-auto text-center">
          <div className="flex justify-center mb-6">
            <Leaf className="h-16 w-16 text-primary" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
            Sustainability
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Building a sustainable future for the LGBTQ+ community through environmental responsibility and mindful practices.
          </p>
        </div>
      </div>

      {/* Our Commitment */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">Our Environmental Commitment</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We believe that caring for our planet is essential to creating safe and thriving spaces for our community.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <TreePine className="h-8 w-8 text-primary" />
                  <CardTitle>Carbon Neutral Events</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  We partner with venues and organizers committed to carbon-neutral practices, and support offset programs for all community events.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Recycle className="h-8 w-8 text-primary" />
                  <CardTitle>Waste Reduction</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Promoting zero-waste events, reusable materials, and comprehensive recycling programs across all community activities.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Sun className="h-8 w-8 text-primary" />
                  <CardTitle>Renewable Energy</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Supporting venues and businesses that use renewable energy sources and promoting solar and wind energy adoption.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Droplets className="h-8 w-8 text-primary" />
                  <CardTitle>Water Conservation</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Implementing water-saving practices in partner venues and promoting awareness about water conservation in our community.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Heart className="h-8 w-8 text-primary" />
                  <CardTitle>Community Gardens</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Supporting LGBTQ+ community gardens and urban farming initiatives that bring people together while caring for the environment.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Leaf className="h-8 w-8 text-primary" />
                  <CardTitle>Green Transportation</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Encouraging carpooling, public transit, cycling, and walking to events while supporting electric vehicle charging at venues.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Take Action */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-6">Take Action with Us</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join our community in making a positive environmental impact. Every small action contributes to a more sustainable future.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button className="bg-primary hover:bg-primary/90">
              Join Green Initiatives
            </Button>
            <Button variant="outline">
              Learn More About Our Impact
            </Button>
          </div>
        </div>
      </section>

      {/* Environmental Impact */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">Our Environmental Impact</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Track our progress and see how our community is making a difference for the planet.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div className="bg-card p-6 border border-border">
              <div className="text-3xl font-bold text-primary mb-2">500+</div>
              <div className="text-muted-foreground">Carbon Neutral Events</div>
            </div>
            <div className="bg-card p-6 border border-border">
              <div className="text-3xl font-bold text-primary mb-2">75%</div>
              <div className="text-muted-foreground">Waste Reduction Goal</div>
            </div>
            <div className="bg-card p-6 border border-border">
              <div className="text-3xl font-bold text-primary mb-2">1000+</div>
              <div className="text-muted-foreground">Community Members Engaged</div>
            </div>
            <div className="bg-card p-6 border border-border">
              <div className="text-3xl font-bold text-primary mb-2">50+</div>
              <div className="text-muted-foreground">Green Partner Venues</div>
            </div>
          </div>

          {/* Website Carbon Badge */}
          <div className="mt-12 text-center">
            <h3 className="text-xl font-semibold text-foreground mb-4">Our Website's Carbon Footprint</h3>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              We monitor and work to minimize our digital carbon footprint. See how this website performs below:
            </p>
            <div className="flex justify-center">
              <div id="wcb" className="carbonbadge"></div>
              <script 
                src="https://unpkg.com/website-carbon-badges@1.1.3/b.min.js" 
                defer
              ></script>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}