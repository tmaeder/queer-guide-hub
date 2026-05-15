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
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { AnimatedCounter } from '@/components/animation/AnimatedCounter';
import { TextGenerateEffect } from '@/components/effects/TextGenerateEffect';
import { SpotlightEffect } from '@/components/effects/SpotlightEffect';
import { BackgroundDots } from '@/components/effects/BackgroundDots';
import { Timeline } from '@/components/effects/Timeline';
import { LampEffect } from '@/components/effects/LampEffect';
import { WordRotate } from '@/components/effects/WordRotate';
import { ShineButton } from '@/components/effects/ShineButton';
import { HoverBorderGradient } from '@/components/effects/HoverBorderGradient';
import { Sparkles as SparklesEffect } from '@/components/effects/Sparkles';

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
  { icon: Heart, title: 'Inclusivity', description: 'Every identity, every background, every story belongs here.' },
  { icon: Shield, title: 'Safety', description: 'Safe spaces online and offline — always our top priority.' },
  { icon: Users, title: 'Community', description: 'Meaningful connections between individuals and organizations worldwide.' },
  { icon: Sparkles, title: 'Authenticity', description: 'Be yourself. We built this place so you never have to hide.' },
  { icon: HandHeart, title: 'Accessibility', description: 'A platform for everyone — highlighting spaces that prioritize access.' },
  { icon: Globe, title: 'Growth', description: 'Always evolving, always listening. Built on your feedback.' },
];

const team = [
  { name: 'Community Moderators', role: 'Keeping it safe', description: 'Volunteer moderators working around the clock to maintain a welcoming, respectful environment.' },
  { name: 'Local Ambassadors', role: 'Eyes on the ground', description: 'Community leaders who surface local needs and champion inclusive spaces in their regions.' },
  { name: 'Content Contributors', role: 'Sharing knowledge', description: 'Members who write venue reviews, post events, and build the resources that make this platform valuable.' },
];

export default function About() {
  const { stats, loading } = useConsolidatedStats();
  const isMobile = useIsMobile();

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
    <div className="min-h-screen">
      {/* Hero */}
      <SpotlightEffect className="relative py-14 sm:py-[72px] md:py-24 px-4 sm:px-6 md:px-8 bg-background overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
          <SparklesEffect density={50} />
          <div className="absolute inset-0 spotlight-radial" />
        </div>
        <div className="relative">
          <TextGenerateEffect
            words="Built by queers, for everyone."
            className="font-extrabold leading-[1.05] mb-4 md:mb-6 text-[2.5rem] sm:text-[4rem] md:text-[5.5rem]"
            style={{ letterSpacing: '0.02em' }}
            as="h1"
            staggerDelay={0.07}
          />
          <div className="reveal-up reveal-delay-1 text-[1.125rem] md:text-[1.375rem] text-muted-foreground mb-3">
            <span className="mr-1.5">A guide for queer</span>
            <WordRotate
              className="text-foreground font-semibold"
              words={['travellers', 'locals', 'activists', 'researchers', 'allies']}
            />
          </div>
          <p className="reveal-up reveal-delay-2 text-[1.0625rem] sm:text-[1.1875rem] md:text-[1.375rem] text-muted-foreground leading-[1.7] max-w-[720px]">
            The Queer Guide connects LGBTQ+ people and allies with safe venues,
            vibrant events, and communities that get you — wherever you are in the world.
          </p>
        </div>
      </SpotlightEffect>

      {/* Stats Strip */}
      <div className="py-10 md:py-14 px-4 sm:px-6 md:px-8 bg-foreground text-background">
        <StaggerGrid
          stagger={0.1}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8"
        >
          {statItems.map((stat, i) => (
            <div key={i} className="text-center">
              <div
                className="font-extrabold leading-[1.1] text-[2.5rem] sm:text-[3rem] md:text-[4rem]"
                style={{
                  letterSpacing: '-0.03em',
                }}
              >
                {loading || typeof stat.value !== 'number' || stat.value <= 0 ? (
                  '—'
                ) : (
                  <AnimatedCounter value={stat.value} suffix="+" />
                )}
              </div>
              <p
                className="opacity-60 mt-1 font-medium uppercase text-[0.7rem]"
                style={{ letterSpacing: '0.02em' }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </StaggerGrid>
      </div>

      {/* Our Story */}
      <ScrollReveal direction="up">
        <section className="py-16 md:py-28 px-4 sm:px-6 md:px-8">
          <h2 className="font-extrabold mb-6 md:mb-8 text-[1.75rem] md:text-[2.25rem]">Our Story</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
            <div className="flex flex-col gap-5">
              <p className="text-muted-foreground leading-[1.8] text-[1.0625rem]">
                Finding a queer-friendly bar shouldn't require a group chat, three Reddit threads,
                and a leap of faith. We started The Queer Guide because we were tired of guessing
                which spaces were actually safe — and which just slapped a rainbow on their logo in June.
              </p>
              <p className="text-muted-foreground leading-[1.8] text-[1.0625rem]">
                What began as a personal list of trusted venues has grown into a global platform — verified
                by the community, powered by real experiences, and always free to use. Whether you're
                traveling solo, moving to a new city, or just looking for your people on a Friday night,
                we've got you.
              </p>
            </div>

            <div
              className="p-6 md:p-8 flex flex-col gap-6 dark:bg-background"
              style={{ backgroundColor: 'hsl(var(--surface-container-low))' }}
            >
              <h6 className="font-bold text-lg">What makes us different</h6>
              <div className="flex flex-col gap-4">
                <p className="text-muted-foreground leading-[1.7]">
                  <span className="font-semibold text-foreground">Community-verified</span>
                  {' '}— Every venue is reviewed by real LGBTQ+ people, not algorithms.
                </p>
                <p className="text-muted-foreground leading-[1.7]">
                  <span className="font-semibold text-foreground">Safety-first</span>
                  {' '}— We flag safety info, local laws, and rights so you know before you go.
                </p>
                <p className="text-muted-foreground leading-[1.7]">
                  <span className="font-semibold text-foreground">Always free</span>
                  {' '}— No paywalls, no premium tiers. This platform belongs to everyone.
                </p>
                <p className="text-muted-foreground leading-[1.7]">
                  <span className="font-semibold text-foreground">Global reach</span>
                  {' '}— From Berlin to Bangkok, São Paulo to Sydney — and growing every day.
                </p>
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* What We Offer */}
      <BackgroundDots
        className="py-16 md:py-28 px-4 sm:px-6 md:px-8 dark:bg-background"
        style={{ backgroundColor: 'hsl(var(--surface-container-low))' }}
      >
        <h2 className="reveal-up font-extrabold mb-8 md:mb-10 text-[1.75rem] md:text-[2.25rem]">
          What We Offer
        </h2>

        <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
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
                    <p
                      className="font-bold text-base md:text-[1.0625rem] flex items-center gap-2"
                    >
                      <Icon style={{ width: 18, height: 18, flexShrink: 0 }} aria-hidden="true" />
                      {feature.title}
                    </p>
                    <p className="text-sm text-muted-foreground leading-[1.6]">{feature.description}</p>
                  </CardContent>
                </Card>
              </LocalizedLink>
            );
          })}
        </StaggerGrid>
      </BackgroundDots>

      {/* Our Values */}
      <ScrollReveal direction="up">
        <section className="py-16 md:py-28 px-4 sm:px-6 md:px-8">
          <h2 className="font-extrabold mb-8 md:mb-10 text-[1.75rem] md:text-[2.25rem]">Our Values</h2>

          <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {values.map((value) => {
              const Icon = value.icon;
              return (
                <div key={value.title} className="flex flex-col gap-2">
                  <p className="font-bold flex items-center gap-2">
                    <Icon style={{ width: 18, height: 18, flexShrink: 0 }} aria-hidden="true" />
                    {value.title}
                  </p>
                  <p className="text-sm text-muted-foreground leading-[1.6]">{value.description}</p>
                </div>
              );
            })}
          </StaggerGrid>
        </section>
      </ScrollReveal>

      {/* Community */}
      <ScrollReveal direction="up">
        <section
          className="py-16 md:py-28 px-4 sm:px-6 md:px-8 dark:bg-background"
          style={{ backgroundColor: 'hsl(var(--surface-container-low))' }}
        >
          <h2 className="font-extrabold mb-2 md:mb-4 text-[1.75rem] md:text-[2.25rem]">
            The People Behind It
          </h2>
          <p className="text-muted-foreground mb-8 md:mb-10 text-[1.0625rem] leading-[1.7] max-w-[600px]">
            The Queer Guide isn't run by a corporation — it's powered by passionate
            community members who volunteer their time and energy.
          </p>

          <StaggerGrid className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
                  <p className="font-bold">{member.name}</p>
                  <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    {member.role}
                  </p>
                  <p className="text-sm text-muted-foreground leading-[1.6]">{member.description}</p>
                </CardContent>
              </Card>
            ))}
          </StaggerGrid>
        </section>
      </ScrollReveal>

      {/* Get Involved CTA */}
      <section className="py-16 md:py-28 px-4 sm:px-6 md:px-8 bg-foreground text-background">
        <ScrollReveal direction="up">
          <h2 className="font-extrabold mb-2 md:mb-4 text-[1.75rem] md:text-[2.25rem]">Get Involved</h2>
          <p className="opacity-60 mb-8 md:mb-10 text-[1.0625rem] leading-[1.7] max-w-[600px]">
            This platform grows because people like you contribute. Here's how you can help.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5 mb-10 md:mb-12">
            {[
              { icon: MapPin, title: 'Add Venues', desc: 'Know a safe spot? Share it.', link: '/venues/new' },
              { icon: Calendar, title: 'Create Events', desc: 'Organize community gatherings.', link: '/events/new' },
              { icon: MessageCircle, title: 'Join Discussions', desc: 'Your voice matters here.', link: '/groups' },
              { icon: Megaphone, title: 'Spread the Word', desc: 'Tell someone who needs this.', link: '/about' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex flex-col gap-2">
                  <p className="font-bold flex items-center gap-2">
                    <Icon style={{ width: 18, height: 18, flexShrink: 0 }} aria-hidden="true" />
                    {item.title}
                  </p>
                  <p className="text-sm opacity-50 leading-[1.6]">{item.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="flex gap-4 flex-wrap">
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
          </div>
        </ScrollReveal>
      </section>

      {/* Timeline — How we got here */}
      <section className="px-4 sm:px-6 md:px-8 py-12 md:py-16">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-extrabold mb-2 md:mb-4 text-[1.75rem] md:text-[2.25rem]">How we got here</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl">A side-project that became a global directory.</p>
        </div>
        <Timeline
          data={[
            {
              title: '2021',
              content: (
                <p className="text-muted-foreground leading-relaxed">
                  A side-project. Three contributors, one spreadsheet, big ambitions. We started with a list of safe
                  bars across five European cities — shared on a Telegram group.
                </p>
              ),
            },
            {
              title: '2023',
              content: (
                <p className="text-muted-foreground leading-relaxed">
                  1,000 venues, 80 cities. First Pride season survived without falling over. We launched the events
                  pipeline and the community submissions extension.
                </p>
              ),
            },
            {
              title: '2025',
              content: (
                <p className="text-muted-foreground leading-relaxed">
                  21,000 venues, 180 countries, 2,300 contributors. Marketplace and trip planner shipped. We added
                  safety briefings, country-by-country rights, and weekly news digests.
                </p>
              ),
            },
            {
              title: '2026',
              content: (
                <p className="text-muted-foreground leading-relaxed">
                  You are here. Help us write the next chapter — submit a venue, organise an event, or join the
                  contributor circle.
                </p>
              ),
            },
          ]}
        />
      </section>

      {/* Lamp CTA */}
      <LampEffect className="min-h-[26rem] py-12">
        <h2 className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-center text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-transparent">
          Help us write the next chapter.
        </h2>
        <p className="mt-3 text-center text-muted-foreground max-w-xl">
          Every verified entry has a story behind it. Add yours.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <LocalizedLink to="/submit" style={{ textDecoration: 'none' }}>
            <ShineButton>Submit a venue</ShineButton>
          </LocalizedLink>
          <LocalizedLink to="/donate" style={{ textDecoration: 'none' }}>
            <HoverBorderGradient>Support us</HoverBorderGradient>
          </LocalizedLink>
        </div>
      </LampEffect>
    </div>
  );
}
