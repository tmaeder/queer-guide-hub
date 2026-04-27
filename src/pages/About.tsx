import { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  Heart,
  Users,
  MapPin,
  Calendar,
  ShoppingBag,
  MessageCircle,
  Shield,
  Sparkles,
  Globe,
  Megaphone,
  HandHeart,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { AnimatedCounter } from '@/components/animation/AnimatedCounter';

const features = [
  {
    icon: MapPin,
    title: 'Venues',
    description: 'Verified queer-friendly bars, cafés, clubs, and businesses — curated by the community, for the community.',
    link: '/venues',
  },
  {
    icon: Calendar,
    title: 'Events',
    description: 'Pride marches, drag shows, support groups, film screenings — find what\'s happening near you or anywhere in the world.',
    link: '/events',
  },
  {
    icon: ShoppingBag,
    title: 'Marketplace',
    description: 'Support LGBTQ+ owned businesses and creators. Shop with purpose, discover with pride.',
    link: '/marketplace',
  },
  {
    icon: MessageCircle,
    title: 'Community',
    description: 'Ask questions, share stories, find your people. A moderated space where every voice matters.',
    link: '/groups',
  },
  {
    icon: Globe,
    title: 'Places',
    description: 'Explore queer-friendly cities and countries. Know before you go — safety info, rights, and local tips.',
    link: '/places',
  },
];

const values = [
  {
    icon: Heart,
    title: 'Inclusivity',
    description: 'Every identity, every background, every story belongs here.',
  },
  {
    icon: Shield,
    title: 'Safety',
    description: 'Safe spaces online and offline — always our top priority.',
  },
  {
    icon: Users,
    title: 'Community',
    description: 'Meaningful connections between individuals and organizations worldwide.',
  },
  {
    icon: Sparkles,
    title: 'Authenticity',
    description: 'Be yourself. We built this place so you never have to hide.',
  },
  {
    icon: HandHeart,
    title: 'Accessibility',
    description: 'A platform for everyone — highlighting spaces that prioritize access.',
  },
  {
    icon: Globe,
    title: 'Growth',
    description: 'Always evolving, always listening. Built on your feedback.',
  },
];

const team = [
  {
    name: 'Community Moderators',
    role: 'Keeping it safe',
    description: 'Volunteer moderators working around the clock to maintain a welcoming, respectful environment.',
  },
  {
    name: 'Local Ambassadors',
    role: 'Eyes on the ground',
    description: 'Community leaders who surface local needs and champion inclusive spaces in their regions.',
  },
  {
    name: 'Content Contributors',
    role: 'Sharing knowledge',
    description: 'Members who write venue reviews, post events, and build the resources that make this platform valuable.',
  },
];

export default function About() {
  const { stats, loading } = useConsolidatedStats();
  const isMobile = useIsMobile();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const statItems = useMemo(
    () => [
      { value: stats.venues, label: 'Venues' },
      { value: stats.events, label: 'Events' },
      { value: stats.cities, label: 'Cities' },
      { value: stats.countries, label: 'Countries' },
    ],
    [stats],
  );

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <Box
        sx={{
          py: { xs: 14, sm: 18, md: 24 },
          px: { xs: 2, sm: 3, md: 4 },
          bgcolor: 'background.default',
        }}
      >
        <Typography
          variant="h1"
          className="reveal-up"
          sx={{
            fontSize: { xs: '2.5rem', sm: '4rem', md: '5.5rem' },
            fontWeight: 800,
            letterSpacing: '0.02em',
            lineHeight: 1.05,
            mb: { xs: 3, md: 4 },
          }}
        >
          Built by queers,
          <br />
          for{' '}
          <Box component="span" sx={{ color: 'brand.main' }}>
            everyone.
          </Box>
        </Typography>

        <Typography
          className="reveal-up reveal-delay-1"
          sx={{
            fontSize: { xs: '1.0625rem', sm: '1.1875rem', md: '1.375rem' },
            color: 'text.secondary',
            lineHeight: 1.7,
            maxWidth: '720px',
          }}
        >
          The Queer Guide connects LGBTQ+ people and allies with safe venues,
          vibrant events, and communities that get you — wherever you are in the world.
        </Typography>
      </Box>

      {/* ── Stats Strip ──────────────────────────────────────────────── */}
      <Box
        sx={{
          bgcolor: 'text.primary',
          color: 'background.default',
          py: { xs: 5, md: 7 },
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        <StaggerGrid
          stagger={0.1}
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              md: 'repeat(4, 1fr)',
            },
            gap: { xs: 3, md: 4 },
          }}
        >
          {statItems.map((stat, i) => (
            <Box key={i} sx={{ textAlign: 'center' }}>
              <Typography
                component="div"
                sx={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: { xs: '2.5rem', sm: '3rem', md: '4rem' },
                  letterSpacing: '-0.03em',
                  lineHeight: 1.1,
                  // brand.light on dark text.primary bg — magenta on near-black is 2.9:1 (WCAG 1.4.3 fail).
                  color: 'brand.light',
                }}
              >
                {loading || typeof stat.value !== 'number' || stat.value <= 0 ? (
                  '\u2014'
                ) : (
                  <AnimatedCounter value={stat.value} suffix="+" />
                )}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'inherit',
                  opacity: 0.6,
                  mt: 0.5,
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                }}
              >
                {stat.label}
              </Typography>
            </Box>
          ))}
        </StaggerGrid>
      </Box>

      {/* ── Our Story ────────────────────────────────────────────────── */}
      <ScrollReveal direction="up">
        <Box
          component="section"
          sx={{
            py: { xs: 8, md: 14 },
            px: { xs: 2, sm: 3, md: 4 },
          }}
        >
          <Typography
            variant="h2"
            sx={{
              fontWeight: 800,
              mb: { xs: 3, md: 4 },
              fontSize: { xs: '1.75rem', md: '2.25rem' },
            }}
          >
            Our Story
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: { xs: 4, md: 6 },
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.8, fontSize: '1.0625rem' }}>
                Finding a queer-friendly bar shouldn't require a group chat, three Reddit threads,
                and a leap of faith. We started The Queer Guide because we were tired of guessing
                which spaces were actually safe — and which just slapped a rainbow on their logo in June.
              </Typography>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.8, fontSize: '1.0625rem' }}>
                What began as a personal list of trusted venues has grown into a global platform — verified
                by the community, powered by real experiences, and always free to use. Whether you're
                traveling solo, moving to a new city, or just looking for your people on a Friday night,
                we've got you.
              </Typography>
            </Box>

            <Box
              sx={{
                bgcolor: isDark ? 'background.paper' : 'hsl(var(--surface-container-low))',
                p: { xs: 3, md: 4 },
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                What makes us different
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                  <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>Community-verified</Box>
                  {' '}— Every venue is reviewed by real LGBTQ+ people, not algorithms.
                </Typography>
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                  <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>Safety-first</Box>
                  {' '}— We flag safety info, local laws, and rights so you know before you go.
                </Typography>
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                  <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>Always free</Box>
                  {' '}— No paywalls, no premium tiers. This platform belongs to everyone.
                </Typography>
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                  <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>Global reach</Box>
                  {' '}— From Berlin to Bangkok, São Paulo to Sydney — and growing every day.
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </ScrollReveal>

      {/* ── What We Offer ────────────────────────────────────────────── */}
      <Box
        component="section"
        sx={{
          bgcolor: isDark ? 'background.paper' : 'hsl(var(--surface-container-low))',
          py: { xs: 8, md: 14 },
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        <Typography
          variant="h2"
          className="reveal-up"
          sx={{
            fontWeight: 800,
            mb: { xs: 4, md: 5 },
            fontSize: { xs: '1.75rem', md: '2.25rem' },
          }}
        >
          What We Offer
        </Typography>

        <StaggerGrid
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
            gap: 2.5,
          }}
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <LocalizedLink
                to={feature.link}
                key={feature.title}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <Card style={{ height: '100%', cursor: 'pointer' }}>
                  <CardContent
                    style={{
                      padding: isMobile ? 20 : 28,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: { xs: '1rem', md: '1.0625rem' },
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Icon style={{ width: 18, height: 18, flexShrink: 0 }} aria-hidden="true" />
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                      {feature.description}
                    </Typography>
                  </CardContent>
                </Card>
              </LocalizedLink>
            );
          })}
        </StaggerGrid>
      </Box>

      {/* ── Our Values ───────────────────────────────────────────────── */}
      <ScrollReveal direction="up">
        <Box
          component="section"
          sx={{
            py: { xs: 8, md: 14 },
            px: { xs: 2, sm: 3, md: 4 },
          }}
        >
          <Typography
            variant="h2"
            sx={{
              fontWeight: 800,
              mb: { xs: 4, md: 5 },
              fontSize: { xs: '1.75rem', md: '2.25rem' },
            }}
          >
            Our Values
          </Typography>

          <StaggerGrid
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
              gap: 2.5,
            }}
          >
            {values.map((value) => {
              const Icon = value.icon;
              return (
                <Box key={value.title} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Icon style={{ width: 18, height: 18, flexShrink: 0 }} aria-hidden="true" />
                    {value.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    {value.description}
                  </Typography>
                </Box>
              );
            })}
          </StaggerGrid>
        </Box>
      </ScrollReveal>

      {/* ── Community ────────────────────────────────────────────────── */}
      <ScrollReveal direction="up">
        <Box
          component="section"
          sx={{
            bgcolor: isDark ? 'background.paper' : 'hsl(var(--surface-container-low))',
            py: { xs: 8, md: 14 },
            px: { xs: 2, sm: 3, md: 4 },
          }}
        >
          <Typography
            variant="h2"
            sx={{
              fontWeight: 800,
              mb: { xs: 1, md: 2 },
              fontSize: { xs: '1.75rem', md: '2.25rem' },
            }}
          >
            The People Behind It
          </Typography>
          <Typography
            sx={{
              color: 'text.secondary',
              mb: { xs: 4, md: 5 },
              fontSize: '1.0625rem',
              lineHeight: 1.7,
              maxWidth: '600px',
            }}
          >
            The Queer Guide isn't run by a corporation — it's powered by passionate
            community members who volunteer their time and energy.
          </Typography>

          <StaggerGrid
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(3, 1fr)',
              },
              gap: 2.5,
            }}
          >
            {team.map((member) => (
              <Card key={member.name} style={{ height: '100%' }}>
                <CardContent
                  style={{
                    padding: isMobile ? 20 : 28,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {member.name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'brand.main', fontWeight: 600 }}>
                    {member.role}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    {member.description}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </StaggerGrid>
        </Box>
      </ScrollReveal>

      {/* ── Get Involved CTA ─────────────────────────────────────────── */}
      <Box
        component="section"
        sx={{
          bgcolor: 'text.primary',
          color: 'background.default',
          py: { xs: 8, md: 14 },
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        <ScrollReveal direction="up">
          <Typography
            variant="h2"
            sx={{
              fontWeight: 800,
              mb: { xs: 1, md: 2 },
              fontSize: { xs: '1.75rem', md: '2.25rem' },
              color: 'inherit',
            }}
          >
            Get Involved
          </Typography>
          <Typography
            sx={{
              color: 'inherit',
              opacity: 0.6,
              mb: { xs: 4, md: 5 },
              fontSize: '1.0625rem',
              lineHeight: 1.7,
              maxWidth: '600px',
            }}
          >
            This platform grows because people like you contribute. Here's how you can help.
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(4, 1fr)',
              },
              gap: 2.5,
              mb: { xs: 5, md: 6 },
            }}
          >
            {[
              { icon: MapPin, title: 'Add Venues', desc: 'Know a safe spot? Share it.', link: '/venues/new' },
              { icon: Calendar, title: 'Create Events', desc: 'Organize community gatherings.', link: '/events/new' },
              { icon: MessageCircle, title: 'Join Discussions', desc: 'Your voice matters here.', link: '/groups' },
              { icon: Megaphone, title: 'Spread the Word', desc: 'Tell someone who needs this.', link: '/about' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Box key={item.title} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      color: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Icon style={{ width: 18, height: 18, flexShrink: 0 }} aria-hidden="true" />
                    {item.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'inherit', opacity: 0.5, lineHeight: 1.6 }}>
                    {item.desc}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <LocalizedLink to="/venues" style={{ textDecoration: 'none' }}>
              <Button size="lg">
                Explore Venues
                <ArrowRight style={{ width: 18, height: 18, marginLeft: 8 }} aria-hidden="true" />
              </Button>
            </LocalizedLink>
            <LocalizedLink to="/donate" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Button variant="outline" size="lg" style={{ color: 'inherit' }}>
                Support Us
              </Button>
            </LocalizedLink>
          </Box>
        </ScrollReveal>
      </Box>
    </Box>
  );
}
