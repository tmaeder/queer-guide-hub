import { Heart, Users, MapPin, Calendar, ShoppingBag, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useConsolidatedStats } from "@/hooks/useConsolidatedStats";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";

export default function About() {
  const { stats, loading } = useConsolidatedStats();

  const formatNumber = (num: number) => {
    if (num >= 1000) return `${Math.floor(num / 1000).toLocaleString()}K+`;
    return num.toLocaleString();
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
    <Box>
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 2 }}>
            <Heart style={{ width: 48, height: 48 }} color="var(--mui-palette-primary-main)" fill="currentColor" />
            <Typography variant="h3" sx={{ fontWeight: 700 }}>About The Queer Guide</Typography>
          </Box>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '48rem', mx: 'auto' }}>
            A comprehensive platform connecting the LGBTQ+ community with safe spaces, events, businesses, and each other.
          </Typography>
        </Box>

      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>Our Mission</Typography>
        <Paper sx={{ p: 4, borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ textAlign: 'center', lineHeight: 1.8 }}>
            The Queer Guide exists to create a safer, more connected world for LGBTQ+ individuals and allies.
            We believe everyone deserves to find welcoming spaces, supportive communities, and opportunities
            to live authentically. Our platform serves as a bridge, connecting people with resources,
            businesses with customers, and communities with each other.
          </Typography>
        </Paper>
      </Box>

      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>What We Offer</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 3 }}>
          {features.map((feature, index) => (
            <Card key={index} sx={{ height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <feature.icon style={{ width: 32, height: 32 }} color="var(--mui-palette-primary-main)" />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>{feature.title}</Typography>
                </Box>
                <Typography color="text.secondary">{feature.description}</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>Our Values</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Inclusivity</Typography>
              <Typography color="text.secondary">
                We welcome all members of the LGBTQ+ community and allies, regardless of identity,
                background, or experience level.
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Safety</Typography>
              <Typography color="text.secondary">
                Creating and maintaining safe spaces is our top priority, both online and in the
                physical locations we feature.
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Community</Typography>
              <Typography color="text.secondary">
                We believe in the power of community and work to foster meaningful connections
                between individuals and organizations.
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Authenticity</Typography>
              <Typography color="text.secondary">
                We encourage everyone to be their authentic selves and provide spaces where
                that authenticity is celebrated.
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Accessibility</Typography>
              <Typography color="text.secondary">
                We strive to make our platform accessible to everyone and highlight venues
                and events that prioritize accessibility.
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Growth</Typography>
              <Typography color="text.secondary">
                We are committed to continuously improving our platform based on community
                feedback and evolving needs.
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>Our Community</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
          {team.map((member, index) => (
            <Card key={index}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>{member.name}</Typography>
                <Typography color="primary" sx={{ fontWeight: 500, mb: 1.5 }}>{member.role}</Typography>
                <Typography color="text.secondary">{member.description}</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>Join Our Mission</Typography>
        <Paper sx={{ p: 4, borderRadius: 2, textAlign: 'center' }}>
          <Typography variant="subtitle1" sx={{ mb: 3 }}>
            Whether you're looking for safe spaces, wanting to connect with others, or hoping to contribute
            to the community, The Queer Guide is here for you. Together, we can build a more inclusive world.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
            {loading ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <Box key={i} sx={{ textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700 }} color="primary">---</Typography>
                    <Typography variant="body2" color="text.secondary">Loading...</Typography>
                  </Box>
                ))}
              </>
            ) : (
              <>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" sx={{ fontWeight: 700 }} color="primary">{formatNumber(stats.venues)}</Typography>
                  <Typography variant="body2" color="text.secondary">Verified Venues</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" sx={{ fontWeight: 700 }} color="primary">{formatNumber(stats.events)}</Typography>
                  <Typography variant="body2" color="text.secondary">Events Listed</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" sx={{ fontWeight: 700 }} color="primary">{formatNumber(stats.cities)}</Typography>
                  <Typography variant="body2" color="text.secondary">Cities Covered</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" sx={{ fontWeight: 700 }} color="primary">{formatNumber(stats.countries)}</Typography>
                  <Typography variant="body2" color="text.secondary">Countries</Typography>
                </Box>
              </>
            )}
          </Box>
        </Paper>
      </Box>

      <Box component="section" sx={{ textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>Get Involved</Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3 }}>
          Ready to be part of something bigger? There are many ways to contribute to The Queer Guide community.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Add Venues</Typography>
              <Typography variant="body2" color="text.secondary">Share LGBTQ+ friendly businesses in your area</Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Create Events</Typography>
              <Typography variant="body2" color="text.secondary">Organize or promote community gatherings</Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Join Discussions</Typography>
              <Typography variant="body2" color="text.secondary">Participate in community conversations</Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Spread the Word</Typography>
              <Typography variant="body2" color="text.secondary">Help others discover our community</Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>
      </Container>
    </Box>
  );
}
