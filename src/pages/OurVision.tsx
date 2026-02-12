import { Heart, Target, Globe, Users, Lightbulb, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";

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
    <Box sx={{ p: 3 }}>
      {/* Hero Section */}
      <Box sx={{ textAlign: 'center', mb: 8 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 3 }}>
          <Target style={{ width: 48, height: 48 }} color="var(--mui-palette-primary-main)" />
          <Typography variant="h3" sx={{ fontWeight: 700, background: 'linear-gradient(to right, var(--mui-palette-primary-main), var(--mui-palette-secondary-main))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Our Vision</Typography>
        </Box>
        <Typography variant="h5" color="text.secondary" sx={{ maxWidth: '56rem', mx: 'auto', lineHeight: 1.8 }}>
          To create a world where every LGBTQ+ person can live authentically,
          find their community, and access safe spaces without fear or hesitation.
        </Typography>
      </Box>

      {/* Vision Statement */}
      <Box component="section" sx={{ mb: 8 }}>
        <Box sx={{ background: 'linear-gradient(to right, rgba(var(--mui-palette-primary-mainChannel) / 0.1), rgba(var(--mui-palette-secondary-mainChannel) / 0.1))', borderRadius: 2, p: 4, mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 3 }}>The Future We're Building</Typography>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.8 }}>
              We envision a future where geography, culture, and circumstance don't determine
              whether an LGBTQ+ person can find acceptance, support, and community. Through
              technology, verification, and genuine human connection, we're building bridges
              that span continents and connect hearts.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Vision Pillars */}
      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>Our Vision Pillars</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4 }}>
          {visionPillars.map((pillar, index) => (
            <Card key={index} style={{ height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <pillar.icon style={{ width: 32, height: 32 }} color="var(--mui-palette-primary-main)" />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>{pillar.title}</Typography>
                </Box>
                <Typography color="text.secondary">{pillar.description}</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      {/* The Problem We're Solving */}
      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>The Challenge</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
          <Card>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }} color="primary">73</Typography>
              <Typography variant="body2" color="text.secondary">Countries where being LGBTQ+ is criminalized</Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }} color="primary">40%</Typography>
              <Typography variant="body2" color="text.secondary">of LGBTQ+ youth have seriously considered suicide</Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }} color="primary">1 in 4</Typography>
              <Typography variant="body2" color="text.secondary">LGBTQ+ individuals experience discrimination</Typography>
            </CardContent>
          </Card>
        </Box>
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 3, maxWidth: '48rem', mx: 'auto' }}>
          These statistics drive our mission. Every safe space we verify, every connection we facilitate,
          and every community we strengthen helps change these numbers for the better.
        </Typography>
      </Box>

      {/* Our Impact Vision */}
      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>The Impact We Envision</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 3 }}>
          <Card>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              <Heart style={{ width: 32, height: 32, margin: '0 auto 12px' }} color="var(--mui-palette-primary-main)" />
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Reduced Isolation</Typography>
              <Typography variant="body2" color="text.secondary">
                No LGBTQ+ person should feel alone or unable to find their community
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              <Shield style={{ width: 32, height: 32, margin: '0 auto 12px' }} color="var(--mui-palette-primary-main)" />
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Increased Safety</Typography>
              <Typography variant="body2" color="text.secondary">
                Verified safe spaces and real community feedback ensure safer experiences
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              <Users style={{ width: 32, height: 32, margin: '0 auto 12px' }} color="var(--mui-palette-primary-main)" />
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Stronger Businesses</Typography>
              <Typography variant="body2" color="text.secondary">
                LGBTQ+ owned businesses thrive through increased visibility and support
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              <Globe style={{ width: 32, height: 32, margin: '0 auto 12px' }} color="var(--mui-palette-primary-main)" />
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Global Awareness</Typography>
              <Typography variant="body2" color="text.secondary">
                Raising awareness about LGBTQ+ issues and promoting acceptance worldwide
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Roadmap */}
      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>Our Journey Forward</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {milestones.map((milestone, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
              <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: '50%', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0 }}>
                {milestone.year}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>{milestone.title}</Typography>
                <Typography color="text.secondary">{milestone.description}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Call to Action */}
      <Paper component="section" sx={{ textAlign: 'center', p: 4, borderRadius: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>Join Our Vision</Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3, maxWidth: '42rem', mx: 'auto' }}>
          This vision becomes reality through community participation. Every venue you add,
          every event you share, and every connection you make brings us closer to our goal.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, justifyContent: 'center' }}>
          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Be a Pioneer</Typography>
              <Typography variant="body2" color="text.secondary">Help us map safe spaces in your area</Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Spread the Word</Typography>
              <Typography variant="body2" color="text.secondary">Share our mission with your networks</Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Give Feedback</Typography>
              <Typography variant="body2" color="text.secondary">Help us improve and grow together</Typography>
            </CardContent>
          </Card>
        </Box>
      </Paper>
    </Box>
  );
}
