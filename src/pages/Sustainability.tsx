import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Leaf, Recycle, Heart, TreePine, Sun, Droplets } from 'lucide-react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';

export default function Sustainability() {
  useEffect(() => {
    // Load Website Carbon badge script
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/website-carbon-badges@1.1.3/b.min.js';
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      // Cleanup script when component unmounts
      const existingScript = document.querySelector('script[src="https://unpkg.com/website-carbon-badges@1.1.3/b.min.js"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero Section */}
      <Box sx={{ position: 'relative', py: 10, px: 2 }}>
        <Container maxWidth="lg" sx={{ textAlign: 'center' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <Leaf style={{ width: 64, height: 64 }} color="var(--mui-palette-primary-main)" />
          </Box>
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 3, typography: { xs: 'h3', md: 'h2' } }}>
            Sustainability
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '48rem', mx: 'auto' }}>
            Building a sustainable future for the LGBTQ+ community through environmental responsibility and mindful practices.
          </Typography>
        </Container>
      </Box>

      {/* Our Commitment */}
      <Box component="section" id="commitments" sx={{ py: 8, px: 2 }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>Our Environmental Commitment</Typography>
            <Typography color="text.secondary" sx={{ maxWidth: '42rem', mx: 'auto' }}>
              We believe that caring for our planet is essential to creating safe and thriving spaces for our community.
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 4 }}>
            <Card>
              <CardHeader>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <TreePine style={{ width: 32, height: 32 }} color="var(--mui-palette-primary-main)" />
                  <CardTitle>Carbon Neutral Events</CardTitle>
                </Box>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary">
                  We partner with venues and organizers committed to carbon-neutral practices, and support offset programs for all community events.
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <Recycle style={{ width: 32, height: 32 }} color="var(--mui-palette-primary-main)" />
                  <CardTitle>Waste Reduction</CardTitle>
                </Box>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary">
                  Promoting zero-waste events, reusable materials, and comprehensive recycling programs across all community activities.
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <Sun style={{ width: 32, height: 32 }} color="var(--mui-palette-primary-main)" />
                  <CardTitle>Renewable Energy</CardTitle>
                </Box>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary">
                  Supporting venues and businesses that use renewable energy sources and promoting solar and wind energy adoption.
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <Droplets style={{ width: 32, height: 32 }} color="var(--mui-palette-primary-main)" />
                  <CardTitle>Water Conservation</CardTitle>
                </Box>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary">
                  Implementing water-saving practices in partner venues and promoting awareness about water conservation in our community.
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <Heart style={{ width: 32, height: 32 }} color="var(--mui-palette-primary-main)" />
                  <CardTitle>Community Gardens</CardTitle>
                </Box>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary">
                  Supporting LGBTQ+ community gardens and urban farming initiatives that bring people together while caring for the environment.
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <Leaf style={{ width: 32, height: 32 }} color="var(--mui-palette-primary-main)" />
                  <CardTitle>Green Transportation</CardTitle>
                </Box>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary">
                  Encouraging carpooling, public transit, cycling, and walking to events while supporting electric vehicle charging at venues.
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Container>
      </Box>

      {/* Take Action */}
      <Box component="section" sx={{ py: 8, px: 2, bgcolor: 'action.hover' }}>
        <Container maxWidth="lg" sx={{ textAlign: 'center' }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>Take Action with Us</Typography>
          <Typography color="text.secondary" sx={{ mb: 4, maxWidth: '42rem', mx: 'auto' }}>
            Join our community in making a positive environmental impact. Every small action contributes to a more sustainable future.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, justifyContent: 'center' }}>
            <Button onClick={() => document.getElementById('commitments')?.scrollIntoView({ behavior: 'smooth' })}>
              Join Green Initiatives
            </Button>
            <Button variant="outline" onClick={() => document.getElementById('impact-stats')?.scrollIntoView({ behavior: 'smooth' })}>
              Learn More About Our Impact
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Environmental Impact */}
      <Box component="section" id="impact-stats" sx={{ py: 8, px: 2 }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>Our Environmental Impact</Typography>
            <Typography color="text.secondary" sx={{ maxWidth: '42rem', mx: 'auto' }}>
              Track our progress and see how our community is making a difference for the planet.
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1fr 1fr 1fr 1fr' }, gap: 4, textAlign: 'center' }}>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }} color="primary">500+</Typography>
              <Typography color="text.secondary">Carbon Neutral Events</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }} color="primary">75%</Typography>
              <Typography color="text.secondary">Waste Reduction Goal</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }} color="primary">1000+</Typography>
              <Typography color="text.secondary">Community Members Engaged</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }} color="primary">50+</Typography>
              <Typography color="text.secondary">Green Partner Venues</Typography>
            </Paper>
          </Box>

          {/* Website Carbon Badge */}
          <Box sx={{ mt: 6, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Our Website's Carbon Footprint</Typography>
            <Typography color="text.secondary" sx={{ mb: 3, maxWidth: '42rem', mx: 'auto' }}>
              We monitor and work to minimize our digital carbon footprint. See how this website performs below:
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <div id="wcb" className="carbonbadge wcb-d"></div>
            </Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
