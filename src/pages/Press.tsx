import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Newspaper, Mail, Globe, MapPin, Calendar, Users, BookOpen, TrendingUp } from "lucide-react";
import { useConsolidatedStats } from "@/hooks/useConsolidatedStats";
import { useMeta } from "@/hooks/useMeta";

export default function Press() {
  useMeta({
    title: 'Press & Media',
    description: 'Press resources and media information for Queer Guide — the LGBTQ+ community platform.',
    canonicalPath: '/press',
  });

  const { stats, loading } = useConsolidatedStats();

  const formatNumber = (num: number) => {
    if (num >= 1000) return `${Math.floor(num / 1000).toLocaleString()}K+`;
    return num.toLocaleString();
  };

  const platformStats = loading
    ? []
    : [
        { label: "Venues Listed", value: formatNumber(stats.venues), icon: MapPin },
        { label: "Cities Covered", value: formatNumber(stats.cities), icon: Globe },
        { label: "Countries", value: formatNumber(stats.countries), icon: Globe },
        { label: "Events", value: formatNumber(stats.events), icon: Calendar },
        { label: "News Articles", value: formatNumber(stats.news), icon: BookOpen },
        { label: "Community Members", value: formatNumber(stats.profiles), icon: Users },
      ];

  return (
    <div className="w-full p-6">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Newspaper className="h-12 w-12 text-primary" />
          <h1 className="text-4xl font-bold gradient-text">Press & Media</h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          Resources for journalists, bloggers, and media professionals covering
          Queer Guide and LGBTQ+ technology initiatives.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* About */}
          <section>
            <h2 className="text-2xl font-bold mb-6">About Queer Guide</h2>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p className="text-muted-foreground">
                  Queer Guide is a comprehensive platform connecting the LGBTQ+ community
                  with safe spaces, events, businesses, and each other. Our mission is to create
                  a safer, more connected world for LGBTQ+ individuals and allies worldwide.
                </p>
                <p className="text-muted-foreground">
                  The platform features verified LGBTQ+-friendly venues, community events,
                  a marketplace for queer-owned businesses, news aggregation, and travel resources
                  spanning cities and countries around the globe.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Platform Statistics */}
          {platformStats.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold mb-6">Platform at a Glance</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {platformStats.map((stat) => (
                  <Card key={stat.label}>
                    <CardContent className="p-4 text-center">
                      <stat.icon className="h-5 w-5 text-primary mx-auto mb-2" />
                      <div className="text-2xl font-bold text-primary">{stat.value}</div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Key Facts */}
          <section>
            <h2 className="text-2xl font-bold mb-6">Key Facts</h2>
            <Card>
              <CardContent className="p-6">
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <TrendingUp className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">
                      Free, open platform available at <a href="https://queer.guide" className="text-primary hover:underline">queer.guide</a>
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">
                      Global coverage with venue and event data across multiple continents
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">
                      Community-driven: users can submit venues, events, and reviews
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Press Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Press Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm">
                For press inquiries, interview requests, or media partnerships,
                please reach out to our team.
              </p>
              <Button asChild className="w-full gap-2">
                <a href="mailto:press@queer.guide">
                  <Mail className="h-4 w-4" />
                  press@queer.guide
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                We aim to respond to press inquiries within 48 hours.
              </p>
            </CardContent>
          </Card>

          {/* Brand Assets */}
          <Card>
            <CardHeader>
              <CardTitle>Brand Assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm">
                For logos, brand guidelines, and visual assets, please contact our
                press team. We'll provide a media kit tailored to your needs.
              </p>
              <Button variant="outline" asChild className="w-full gap-2">
                <a href="mailto:press@queer.guide?subject=Brand%20Assets%20Request">
                  <Mail className="h-4 w-4" />
                  Request Brand Assets
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* Usage Guidelines */}
          <Card>
            <CardHeader>
              <CardTitle>Usage Guidelines</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">&bull;</span>
                  <span>Use &ldquo;Queer Guide&rdquo; (two words, capitalized) in all references</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">&bull;</span>
                  <span>Link to <a href="https://queer.guide" className="text-primary hover:underline">queer.guide</a> when referencing the platform</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">&bull;</span>
                  <span>Contact us for approval before using our logo or brand materials</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
