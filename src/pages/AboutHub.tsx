import { useState } from 'react';
import {
  Heart,
  Target,
  Star,
  Leaf,
  Users,
  MapPin,
  Calendar,
  ShoppingBag,
  MessageCircle,
  Shield,
  Globe,
  Lightbulb,
  Award,
  Handshake,
  TreePine,
  Recycle,
  Sun,
  Droplets,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function AboutHub() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    about: false,
    vision: false,
    values: false,
    sustainability: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const features = [
    {
      icon: MapPin,
      title: 'LGBTQ+ Friendly Venues',
      description:
        'Discover safe spaces, restaurants, bars, and businesses that welcome and celebrate the LGBTQ+ community.',
    },
    {
      icon: Calendar,
      title: 'Community Events',
      description:
        'Find pride events, social gatherings, support groups, and celebrations happening in your area.',
    },
    {
      icon: ShoppingBag,
      title: 'Marketplace',
      description:
        'Support LGBTQ+ owned businesses and find products and services from community members.',
    },
    {
      icon: MessageCircle,
      title: 'Community Forum',
      description:
        'Connect with others, share experiences, ask questions, and build meaningful relationships.',
    },
  ];

  const coreValues = [
    {
      icon: Heart,
      title: 'Love & Acceptance',
      description:
        'We believe love is love, and everyone deserves to be accepted for who they are.',
    },
    {
      icon: Shield,
      title: 'Safety & Security',
      description:
        'The safety of our community members is our highest priority with rigorous verification processes.',
    },
    {
      icon: Users,
      title: 'Community First',
      description:
        'We put community needs before profit, evaluating every decision through the lens of community benefit.',
    },
    {
      icon: Globe,
      title: 'Global Inclusivity',
      description:
        'Our platform welcomes people from all backgrounds, cultures, and locations worldwide.',
    },
  ];

  const sustainabilityInitiatives = [
    {
      icon: TreePine,
      title: 'Carbon Neutral Events',
      description:
        'Partner with venues committed to carbon-neutral practices and support offset programs.',
    },
    {
      icon: Recycle,
      title: 'Waste Reduction',
      description:
        'Promoting zero-waste events, reusable materials, and comprehensive recycling programs.',
    },
    {
      icon: Sun,
      title: 'Renewable Energy',
      description:
        'Supporting venues that use renewable energy sources and promoting clean energy adoption.',
    },
    {
      icon: Droplets,
      title: 'Water Conservation',
      description:
        'Implementing water-saving practices and promoting conservation awareness in our community.',
    },
  ];

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 2 }}
        >
          <Heart
            style={{
              width: 48,
              height: 48,
              color: 'var(--mui-palette-primary-main)',
              fill: 'currentColor',
              animation: 'pulse 2s infinite',
            }}
          />
          <Typography
            variant="h3"
            sx={{
              fontWeight: 700,
              background:
                'linear-gradient(to right, var(--mui-palette-primary-main), var(--mui-palette-secondary-main))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            About The Queer Guide
          </Typography>
        </Box>
        <Typography color="text.secondary" sx={{ fontSize: '1.125rem' }}>
          Learn about our mission, values, vision, and commitment to sustainability
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* About Us */}
        <Card>
          <Collapsible open={openSections.about} onOpenChange={() => toggleSection('about')}>
            <CollapsibleTrigger asChild>
              <CardHeader
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.2s',
                }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Heart
                      style={{ width: 24, height: 24 }}
                      color="var(--mui-palette-primary-main)"
                    />
                    <Box sx={{ textAlign: 'left' }}>
                      <CardTitle>About Us</CardTitle>
                      <CardDescription>
                        Our mission and what we offer to the community
                      </CardDescription>
                    </Box>
                  </Box>
                  {openSections.about ? (
                    <ChevronDown style={{ width: 20, height: 20 }} />
                  ) : (
                    <ChevronRight style={{ width: 20, height: 20 }} />
                  )}
                </Box>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Our Mission
                    </Typography>
                    <Typography>
                      The Queer Guide exists to create a safer, more connected world for LGBTQ+
                      individuals and allies. We believe everyone deserves to find welcoming spaces,
                      supportive communities, and opportunities to live authentically.
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      What We Offer
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      {features.map((feature, index) => (
                        <Box
                          key={index}
                          sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}
                        >
                          <feature.icon
                            style={{
                              width: 24,
                              height: 24,
                              marginTop: 4,
                              flexShrink: 0,
                              color: 'var(--mui-palette-primary-main)',
                            }}
                          />
                          <Box>
                            <Typography sx={{ fontWeight: 500 }}>{feature.title}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {feature.description}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Our Vision */}
        <Card>
          <Collapsible open={openSections.vision} onOpenChange={() => toggleSection('vision')}>
            <CollapsibleTrigger asChild>
              <CardHeader
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.2s',
                }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Target
                      style={{ width: 24, height: 24 }}
                      color="var(--mui-palette-primary-main)"
                    />
                    <Box sx={{ textAlign: 'left' }}>
                      <CardTitle>Our Vision</CardTitle>
                      <CardDescription>
                        The future we're building for the LGBTQ+ community
                      </CardDescription>
                    </Box>
                  </Box>
                  {openSections.vision ? (
                    <ChevronDown style={{ width: 20, height: 20 }} />
                  ) : (
                    <ChevronRight style={{ width: 20, height: 20 }} />
                  )}
                </Box>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      The Future We're Building
                    </Typography>
                    <Typography>
                      To create a world where every LGBTQ+ person can live authentically, find their
                      community, and access safe spaces without fear or hesitation.
                    </Typography>
                    <Typography>
                      We envision a future where geography, culture, and circumstance don't
                      determine whether an LGBTQ+ person can find acceptance, support, and
                      community.
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Vision Pillars
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      <Box>
                        <Typography
                          sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Globe
                            style={{ width: 20, height: 20 }}
                            color="var(--mui-palette-primary-main)"
                          />
                          Global Inclusivity
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Safe, welcoming spaces wherever you are, from major cities to small towns
                          across the globe.
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Users
                            style={{ width: 20, height: 20 }}
                            color="var(--mui-palette-primary-main)"
                          />
                          Connected Communities
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Bridging gaps between isolated individuals and vibrant communities.
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Shield
                            style={{ width: 20, height: 20 }}
                            color="var(--mui-palette-primary-main)"
                          />
                          Safety First
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Verified safe spaces where authenticity is celebrated and discrimination
                          has no place.
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Lightbulb
                            style={{ width: 20, height: 20 }}
                            color="var(--mui-palette-primary-main)"
                          />
                          Innovation for Good
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Leveraging technology to solve real problems and make resources more
                          accessible.
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Our Values */}
        <Card>
          <Collapsible open={openSections.values} onOpenChange={() => toggleSection('values')}>
            <CollapsibleTrigger asChild>
              <CardHeader
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.2s',
                }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Star
                      style={{ width: 24, height: 24 }}
                      color="var(--mui-palette-primary-main)"
                    />
                    <Box sx={{ textAlign: 'left' }}>
                      <CardTitle>Our Values</CardTitle>
                      <CardDescription>
                        The principles that guide every decision we make
                      </CardDescription>
                    </Box>
                  </Box>
                  {openSections.values ? (
                    <ChevronDown style={{ width: 20, height: 20 }} />
                  ) : (
                    <ChevronRight style={{ width: 20, height: 20 }} />
                  )}
                </Box>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Core Values
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      {coreValues.map((value, index) => (
                        <Box
                          key={index}
                          sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}
                        >
                          <value.icon
                            style={{
                              width: 24,
                              height: 24,
                              marginTop: 4,
                              flexShrink: 0,
                              color: 'var(--mui-palette-primary-main)',
                            }}
                          />
                          <Box>
                            <Typography sx={{ fontWeight: 500 }}>{value.title}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {value.description}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      How We Operate
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      <Box>
                        <Typography
                          sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Award
                            style={{ width: 20, height: 20 }}
                            color="var(--mui-palette-primary-main)"
                          />
                          Transparency
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Open communication about our policies, decisions, and operations.
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Handshake
                            style={{ width: 20, height: 20 }}
                            color="var(--mui-palette-primary-main)"
                          />
                          Collaboration
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Working together with community organizations and local businesses.
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Heart
                            style={{ width: 20, height: 20 }}
                            color="var(--mui-palette-primary-main)"
                          />
                          Empathy
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Understanding and sharing the experiences of our community members.
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Sustainability */}
        <Card>
          <Collapsible
            open={openSections.sustainability}
            onOpenChange={() => toggleSection('sustainability')}
          >
            <CollapsibleTrigger asChild>
              <CardHeader
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.2s',
                }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Leaf
                      style={{ width: 24, height: 24 }}
                      color="var(--mui-palette-primary-main)"
                    />
                    <Box sx={{ textAlign: 'left' }}>
                      <CardTitle>Sustainability</CardTitle>
                      <CardDescription>
                        Our commitment to environmental responsibility
                      </CardDescription>
                    </Box>
                  </Box>
                  {openSections.sustainability ? (
                    <ChevronDown style={{ width: 20, height: 20 }} />
                  ) : (
                    <ChevronRight style={{ width: 20, height: 20 }} />
                  )}
                </Box>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Our Environmental Commitment
                    </Typography>
                    <Typography>
                      We believe that caring for our planet is essential to creating safe and
                      thriving spaces for our community. Building a sustainable future through
                      environmental responsibility and mindful practices.
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Green Initiatives
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      {sustainabilityInitiatives.map((initiative, index) => (
                        <Box
                          key={index}
                          sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}
                        >
                          <initiative.icon
                            style={{
                              width: 24,
                              height: 24,
                              marginTop: 4,
                              flexShrink: 0,
                              color: 'var(--mui-palette-primary-main)',
                            }}
                          />
                          <Box>
                            <Typography sx={{ fontWeight: 500 }}>{initiative.title}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {initiative.description}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Additional Commitments
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 500 }}>Community Gardens</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Supporting LGBTQ+ community gardens and urban farming initiatives.
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight: 500 }}>Green Transportation</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Encouraging sustainable transportation to events and supporting EV
                          charging.
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </Box>

      {/* Contact Section */}
      <Card sx={{ mt: 4 }}>
        <CardHeader>
          <CardTitle sx={{ textAlign: 'center' }}>Get in Touch</CardTitle>
          <CardDescription sx={{ textAlign: 'center' }}>
            Questions about our mission, values, or sustainability efforts?
          </CardDescription>
        </CardHeader>
        <CardContent sx={{ textAlign: 'center' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Box>
              <Typography sx={{ fontWeight: 500, mb: 1 }}>General Inquiries</Typography>
              <Typography variant="body2" color="text.secondary">
                <a
                  href="mailto:hello@queer.guide"
                  style={{ color: 'inherit', textDecoration: 'underline' }}
                >
                  hello@queer.guide
                </a>
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 500, mb: 1 }}>Values & Feedback</Typography>
              <Typography variant="body2" color="text.secondary">
                <a
                  href="mailto:values@queer.guide"
                  style={{ color: 'inherit', textDecoration: 'underline' }}
                >
                  values@queer.guide
                </a>
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}
