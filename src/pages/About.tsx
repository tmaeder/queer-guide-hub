import { useMemo, useState } from 'react';
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
import { Timeline } from '@/components/effects/Timeline';
import { EditorialHero } from '@/components/editorial/EditorialHero';
import { EDITORIAL_IMAGES, type EditorialImage } from '@/lib/editorialImages';

interface FeatureItem {
  icon: typeof MapPin;
  title: string;
  description: string;
  link: string;
  image?: EditorialImage;
  colSpan?: 1 | 2;
}

const featuresBase = [
  {
    icon: MapPin,
    title: 'Venues',
    description:
      'Verified queer-friendly bars, cafés, clubs, and businesses — built by the community, for the community.',
    link: '/venues',
  },
  {
    icon: Calendar,
    title: 'Events',
    description:
      "Pride marches, drag shows, support groups, film screenings — find what's happening near you or anywhere in the world.",
    link: '/events',
  },
  {
    icon: ShoppingBag,
    title: 'Marketplace',
    description: 'Support LGBTQ+ owned businesses and creators. Shop with purpose.',
    link: '/marketplace',
  },
  {
    icon: MessageCircle,
    title: 'Community',
    description:
      'Ask questions, share stories, find your people. A moderated space where every voice matters.',
    link: '/groups',
  },
  {
    icon: Globe,
    title: 'Places',
    description:
      'Queer-friendly cities and countries. Know before you go — safety info, rights, and local tips.',
    link: '/places',
  },
] as const;

const differentiators = [
  {
    label: 'Community-verified',
    body: 'Every venue is reviewed by real LGBTQ+ people, not algorithms.',
  },
  {
    label: 'Safety-first',
    body: 'We flag safety info, local laws, and rights so you know before you go.',
  },
  {
    label: 'Always free',
    body: 'No paywalls, no premium tiers. This platform belongs to everyone.',
  },
  {
    label: 'Global reach',
    body: 'From Berlin to Bangkok, São Paulo to Sydney — and growing every day.',
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
  {
    name: 'Community Moderators',
    role: 'Keeping it safe',
    description:
      'Volunteer moderators working around the clock to maintain a welcoming, respectful environment.',
  },
  {
    name: 'Local Ambassadors',
    role: 'Eyes on the ground',
    description:
      'Community leaders who surface local needs and champion inclusive spaces in their regions.',
  },
  {
    name: 'Content Contributors',
    role: 'Sharing knowledge',
    description:
      'Members who write venue reviews, post events, and build the resources that make this platform valuable.',
  },
];

const getInvolved = [
  { icon: MapPin, title: 'Add Venues', desc: 'Know a safe spot? Share it.', link: '/venues/new' },
  { icon: Calendar, title: 'Create Events', desc: 'Organize community gatherings.', link: '/events/new' },
  { icon: MessageCircle, title: 'Join Discussions', desc: 'Your voice matters here.', link: '/groups' },
  { icon: Megaphone, title: 'Spread the Word', desc: 'Tell someone who needs this.', link: '/about' },
];

export default function About() {
  const { stats, loading } = useConsolidatedStats();

  const statItems = useMemo(
    () => [
      { value: stats.venues, label: 'Venues' },
      { value: stats.events, label: 'Events' },
      { value: stats.cities, label: 'Cities' },
      { value: stats.countries, label: 'Countries' },
    ],
    [stats],
  );

  // Inject imagery into the Venues + Community tiles (matches the bento rhythm).
  const aboutExtras = EDITORIAL_IMAGES.about.extras ?? [];
  const features: FeatureItem[] = featuresBase.map((f) => {
    if (f.title === 'Venues' && aboutExtras[0]) return { ...f, image: aboutExtras[0], colSpan: 2 };
    if (f.title === 'Community' && aboutExtras[2]) return { ...f, image: aboutExtras[2], colSpan: 2 };
    return f;
  });

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="px-4 sm:px-6 md:px-8 pt-8 md:pt-12">
        <div className="max-w-6xl mx-auto">
          <EditorialHero
            eyebrow="About us"
            title="Built by queers, for everyone."
            subtitle="Queer Guide connects LGBTQ+ people and allies with safe venues, vibrant events, and communities that get you — wherever you are in the world."
            image={EDITORIAL_IMAGES.about.hero}
            imagePosition="cover"
            decoration="grid"
            height="lg"
          />
        </div>
      </section>

      {/* Stats strip */}
      <div className="mt-12 md:mt-16 bg-foreground text-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-10 md:py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
            {statItems.map((stat) => (
              <div key={stat.label}>
                <div className="font-bold leading-[1.05] tracking-tight text-display md:text-hero">
                  {loading || typeof stat.value !== 'number' || stat.value <= 0
                    ? '—'
                    : `${stat.value.toLocaleString()}+`}
                </div>
                <p className="mt-1 font-medium uppercase tracking-label text-xs2 text-background/60">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Our Story */}
      <section className="px-4 sm:px-6 md:px-8 py-16 md:py-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-10 md:gap-16">
          <div>
            <h2 className="font-bold text-headline md:text-display">Our story</h2>
            <div className="mt-6 flex flex-col gap-6 max-w-prose">
              <p className="text-body-lg leading-[1.8] text-muted-foreground">
                Finding a queer-friendly bar shouldn't require a group chat, three Reddit threads,
                and a leap of faith. We started Queer Guide because we were tired of guessing which
                spaces were actually safe — and which just slapped a rainbow on their logo in June.
              </p>
              <p className="text-body-lg leading-[1.8] text-muted-foreground">
                What began as a personal list of trusted venues has grown into a global platform —
                verified by the community, powered by real experiences, and always free to use.
                Whether you're traveling solo, moving to a new city, or just looking for your people
                on a Friday night, we've got you.
              </p>
            </div>
          </div>

          <div className="bg-muted dark:bg-card border border-border rounded-container p-6 md:p-8">
            <h3 className="font-bold text-title">What makes us different</h3>
            <dl className="mt-6 flex flex-col gap-4">
              {differentiators.map((d) => (
                <div key={d.label}>
                  <dt className="font-semibold text-foreground">{d.label}</dt>
                  <dd className="text-15 leading-[1.6] text-muted-foreground">{d.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* What We Offer */}
      <section className="px-4 sm:px-6 md:px-8 py-16 md:py-24 bg-muted/40 dark:bg-card/30 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-bold text-headline md:text-display">What we offer</h2>
          <p className="mt-4 text-body-lg leading-[1.6] text-muted-foreground max-w-prose">
            Five ways to find your people — and the spaces that welcome them.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature) => (
              <LocalizedLink
                key={feature.title}
                to={feature.link}
                className={
                  'group block rounded-container overflow-hidden border border-border bg-card text-foreground no-underline transition-colors hover:bg-accent ' +
                  (feature.colSpan === 2 ? 'sm:col-span-2' : '')
                }
              >
                {feature.image ? (
                  <FeatureImageTile
                    title={feature.title}
                    description={feature.description}
                    Icon={feature.icon}
                    image={feature.image}
                  />
                ) : (
                  <div className="flex h-full flex-col gap-2 p-6 md:p-8">
                    <feature.icon size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="font-bold text-body-lg">{feature.title}</p>
                    <p className="text-15 leading-[1.6] text-muted-foreground">{feature.description}</p>
                  </div>
                )}
              </LocalizedLink>
            ))}
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="px-4 sm:px-6 md:px-8 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-bold text-headline md:text-display">What we value</h2>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
            {values.map((value) => (
              <div key={value.title} className="flex flex-col gap-2">
                <p className="font-bold flex items-center gap-2">
                  <value.icon size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  {value.title}
                </p>
                <p className="text-15 leading-[1.6] text-muted-foreground">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The People Behind It */}
      <section className="px-4 sm:px-6 md:px-8 py-16 md:py-24 bg-muted/40 dark:bg-card/30 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-bold text-headline md:text-display">The people behind it</h2>
          <p className="mt-4 text-body-lg leading-[1.6] text-muted-foreground max-w-prose">
            Queer Guide isn't run by a corporation — it's powered by community members who volunteer
            their time and energy.
          </p>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {team.map((member) => (
              <Card key={member.name} className="h-full">
                <CardContent className="flex flex-col gap-2 p-6 md:p-8">
                  <p className="font-bold">{member.name}</p>
                  <p className="text-13 font-semibold uppercase tracking-label text-muted-foreground">
                    {member.role}
                  </p>
                  <p className="text-15 leading-[1.6] text-muted-foreground">{member.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="px-4 sm:px-6 md:px-8 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-bold text-headline md:text-display">How we got here</h2>
          <p className="mt-4 text-body-lg leading-[1.6] text-muted-foreground max-w-prose">
            A side-project that became a global directory.
          </p>
        </div>
        <Timeline
          data={[
            {
              title: '2021',
              content: (
                <p className="text-muted-foreground leading-relaxed">
                  A side-project. Three contributors, one spreadsheet, big ambitions. We started with
                  a list of safe bars across five European cities — shared on a Telegram group.
                </p>
              ),
            },
            {
              title: '2023',
              content: (
                <p className="text-muted-foreground leading-relaxed">
                  1,000 venues, 80 cities. First Pride season survived without falling over. We
                  launched the events pipeline and the community submissions extension.
                </p>
              ),
            },
            {
              title: '2025',
              content: (
                <p className="text-muted-foreground leading-relaxed">
                  21,000 venues, 180 countries, 2,300 contributors. Marketplace and trip planner
                  shipped. We added safety briefings, country-by-country rights, and weekly news
                  digests.
                </p>
              ),
            },
            {
              title: '2026',
              content: (
                <p className="text-muted-foreground leading-relaxed">
                  You are here. Help us write the next chapter — submit a venue, organise an event,
                  or join the contributor circle.
                </p>
              ),
            },
          ]}
        />
      </section>

      {/* Closing CTA — get involved */}
      <section className="px-4 sm:px-6 md:px-8 py-16 md:py-24 bg-foreground text-background">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-bold text-headline md:text-display max-w-2xl">
            Help us write the next chapter.
          </h2>
          <p className="mt-4 text-body-lg leading-[1.7] text-background/75 max-w-2xl">
            This platform grows because people like you contribute. Every verified entry has a story
            behind it — add yours.
          </p>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-6">
            {getInvolved.map((item) => (
              <LocalizedLink
                key={item.title}
                to={item.link}
                className="group flex flex-col gap-1.5 text-background no-underline"
              >
                <p className="font-bold flex items-center gap-2">
                  <item.icon size={18} className="shrink-0" aria-hidden="true" />
                  {item.title}
                </p>
                <p className="text-15 leading-[1.6] text-background/70">{item.desc}</p>
              </LocalizedLink>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-2">
            <LocalizedLink to="/submit" className="no-underline">
              <Button
                size="lg"
                className="bg-background text-foreground hover:bg-background/90 hover:opacity-100"
              >
                Submit a venue
                <ArrowRight size={18} className="ml-1" aria-hidden="true" />
              </Button>
            </LocalizedLink>
            <LocalizedLink to="/donate" className="no-underline">
              <Button
                size="lg"
                variant="outline"
                className="border-background/40 bg-transparent text-background hover:bg-background/10 hover:text-background"
              >
                Support us
              </Button>
            </LocalizedLink>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureImageTile({
  title,
  description,
  Icon,
  image,
}: {
  title: string;
  description: string;
  Icon: typeof MapPin;
  image: EditorialImage;
}) {
  const [src, setSrc] = useState(image.src);
  const [errored, setErrored] = useState(false);
  return (
    <div className="relative h-full min-h-[240px] md:min-h-[260px] overflow-hidden">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a media-error handler, not a user-input listener. */}
      <img
        src={src}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (image.fallback) setSrc(image.fallback);
          setErrored(true);
        }}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
      {!errored && image.credit && (
        <span
          className="absolute top-1.5 right-2 z-[2] max-w-[60%] truncate text-2xs leading-tight text-white/55"
          title={image.credit}
        >
          {image.credit}
        </span>
      )}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/20 to-black/70"
      />
      <div className="relative z-[1] flex h-full flex-col justify-end gap-2 p-6 md:p-8 text-white">
        <p className="font-bold text-body-lg flex items-center gap-2">
          <Icon size={18} className="shrink-0" aria-hidden="true" />
          {title}
        </p>
        <p className="text-15 leading-[1.6] text-white/85 max-w-[420px]">{description}</p>
      </div>
    </div>
  );
}
