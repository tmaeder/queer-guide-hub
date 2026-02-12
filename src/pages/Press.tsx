import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Newspaper, Mail, Globe, MapPin, Calendar, Users, BookOpen, TrendingUp } from "lucide-react";
import { useConsolidatedStats } from "@/hooks/useConsolidatedStats";
import { useMeta } from "@/hooks/useMeta";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

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
    <Box sx={{ p: 3 }}>
      {/* Hero Section */}
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 2 }}>
          <Newspaper style={{ width: 48, height: 48 }} color="var(--mui-palette-primary-main)" />
          <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.primary' }}>Press & Media</Typography>
        </Box>
        <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '48rem', mx: 'auto' }}>
          Resources for journalists, bloggers, and media professionals covering
          Queer Guide and LGBTQ+ technology initiatives.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 4 }}>
        {/* Main Content */}
        <Box sx={{ gridColumn: { lg: 'span 2' }, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* About */}
          <Box component="section">
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>About Queer Guide</Typography>
            <Card>
              <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography color="text.secondary">
                  Queer Guide is a comprehensive platform connecting the LGBTQ+ community
                  with safe spaces, events, businesses, and each other. Our mission is to create
                  a safer, more connected world for LGBTQ+ individuals and allies worldwide.
                </Typography>
                <Typography color="text.secondary">
                  The platform features verified LGBTQ+-friendly venues, community events,
                  a marketplace for queer-owned businesses, news aggregation, and travel resources
                  spanning cities and countries around the globe.
                </Typography>
              </CardContent>
            </Card>
          </Box>

          {/* Platform Statistics */}
          {platformStats.length > 0 && (
            <Box component="section">
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Platform at a Glance</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                {platformStats.map((stat) => (
                  <Card key={stat.label}>
                    <CardContent sx={{ p: 2, textAlign: 'center' }}>
                      <stat.icon style={{ width: 20, height: 20, margin: '0 auto 8px' }} color="var(--mui-palette-primary-main)" />
                      <Typography variant="h5" sx={{ fontWeight: 700 }} color="primary">{stat.value}</Typography>
                      <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Box>
          )}

          {/* Key Facts */}
          <Box component="section">
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Key Facts</Typography>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <TrendingUp style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }} color="var(--mui-palette-primary-main)" />
                    <Typography color="text.secondary">
                      Free, open platform available at <Typography component="a" href="https://queer.guide" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>queer.guide</Typography>
                    </Typography>
                  </Box>
                  <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Globe style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }} color="var(--mui-palette-primary-main)" />
                    <Typography color="text.secondary">
                      Global coverage with venue and event data across multiple continents
                    </Typography>
                  </Box>
                  <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Users style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }} color="var(--mui-palette-primary-main)" />
                    <Typography color="text.secondary">
                      Community-driven: users can submit venues, events, and reviews
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        {/* Sidebar */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Press Contact */}
          <Card>
            <CardHeader>
              <CardTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Mail style={{ width: 20, height: 20 }} />
                  Press Contact
                </Box>
              </CardTitle>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                For press inquiries, interview requests, or media partnerships,
                please reach out to our team.
              </Typography>
              <Button asChild style={{ width: '100%', display: 'inline-flex', gap: 8 }}>
                <a href="mailto:press@queer.guide">
                  <Mail style={{ width: 16, height: 16 }} />
                  press@queer.guide
                </a>
              </Button>
              <Typography variant="caption" color="text.secondary">
                We aim to respond to press inquiries within 48 hours.
              </Typography>
            </CardContent>
          </Card>

          {/* Brand Assets */}
          <Card>
            <CardHeader>
              <CardTitle>Brand Assets</CardTitle>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                For logos, brand guidelines, and visual assets, please contact our
                press team. We'll provide a media kit tailored to your needs.
              </Typography>
              <Button variant="outline" asChild style={{ width: '100%', display: 'inline-flex', gap: 8 }}>
                <a href="mailto:press@queer.guide?subject=Brand%20Assets%20Request">
                  <Mail style={{ width: 16, height: 16 }} />
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
              <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Typography component="span" color="primary" sx={{ mt: 0.5 }}>&bull;</Typography>
                  <Typography variant="body2" color="text.secondary">Use &ldquo;Queer Guide&rdquo; (two words, capitalized) in all references</Typography>
                </Box>
                <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Typography component="span" color="primary" sx={{ mt: 0.5 }}>&bull;</Typography>
                  <Typography variant="body2" color="text.secondary">Link to <Typography component="a" href="https://queer.guide" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>queer.guide</Typography> when referencing the platform</Typography>
                </Box>
                <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Typography component="span" color="primary" sx={{ mt: 0.5 }}>&bull;</Typography>
                  <Typography variant="body2" color="text.secondary">Contact us for approval before using our logo or brand materials</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
