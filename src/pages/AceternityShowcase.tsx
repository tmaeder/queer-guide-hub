import React from 'react';
import {
  TextGenerateEffect,
  TextHoverEffect,
  TextRevealCard,
  WordRotate,
  Beams,
  Meteors,
  Sparkles,
  ShootingStars,
  Vortex,
  WavyBackground,
  BackgroundLines,
  BackgroundGradient,
  Boxes,
  LampEffect,
  SpotlightEffect,
  GrainOverlay,
  BentoGrid,
  BentoGridItem,
  CardContainer3D,
  CardItem,
  CardStack,
  ExpandableCard,
  FocusCards,
  LayoutGrid,
  PinContainer,
  WobbleCard,
  AnimatedBeam,
  AnimatedModal,
  AnimatedTooltip,
  AppleCardsCarousel,
  Compare,
  ContainerScroll,
  DraggableCardBody,
  DraggableCardContainer,
  FollowingPointer,
  GlowingEffect,
  HeroParallax,
  HoverBorderGradient,
  ImagesSlider,
  InfiniteMovingCards,
  Lens,
  LinkPreview,
  Marquee,
  MovingBorder,
  MultiStepLoader,
  NavbarMenu,
  NavbarMenuItem,
  NavbarHoveredLink,
  ShineButton,
  StickyScroll,
  Timeline,
  TracingBeam,
  WorldMap,
  type CarouselCard,
  type LayoutGridCard,
  type ExpandableCardItem,
  type LoadingState,
} from '@/components/effects';
import { getRandomFallbackImage } from '@/utils/fallbackImages';
import { MapPin, Calendar, Compass, Heart, Sparkles as SparklesIcon, Map, Users } from 'lucide-react';

const IMG = () => getRandomFallbackImage();

function Section({ id, title, kicker, children }: { id: string; title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-t border-border/60 py-16 md:py-20 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="mb-8">
          {kicker && <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{kicker}</p>}
          <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

export default function AceternityShowcase() {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [loaderOpen, setLoaderOpen] = React.useState(false);
  const loadingStates: LoadingState[] = [
    { text: 'Verifying your venue submission…' },
    { text: 'Checking duplicates against 21k existing venues…' },
    { text: 'Running quality checks…' },
    { text: 'Sending to community review…' },
    { text: 'Saved.' },
  ];

  const expandableItems: ExpandableCardItem[] = [
    { id: 'a', title: 'Pride 2026 guide', description: 'Seven of the most welcoming parades.', src: IMG(), content: <p>Seven cities, seven stories.</p>, ctaText: 'Read', ctaLink: '#' },
    { id: 'b', title: 'Safety atlas', description: 'Country-by-country snapshot.', src: IMG(), content: <p>Built with on-the-ground contributors.</p>, ctaText: 'Open', ctaLink: '#' },
    { id: 'c', title: 'Queer villages', description: 'Towns we have always called home.', src: IMG(), content: <p>Provincetown, Sitges, Mykonos.</p>, ctaText: 'Browse', ctaLink: '#' },
    { id: 'd', title: 'Contributors', description: '2,300+ verified contributors.', src: IMG(), content: <p>Bartenders, organisers, professors.</p>, ctaText: 'Credits', ctaLink: '#' },
  ];

  const carouselCards: CarouselCard[] = ['Berlin', 'New York', 'Mexico City', 'Bangkok', 'Tel Aviv', 'Buenos Aires', 'Cape Town', 'Tokyo']
    .map((title) => ({ title, src: IMG(), href: '#' }));

  const layoutCards: LayoutGridCard[] = [
    { id: 1, src: IMG(), className: 'md:col-span-2 md:row-span-2 h-80', content: <p>Featured story.</p> },
    { id: 2, src: IMG(), className: 'h-40', content: <p>Spotlight.</p> },
    { id: 3, src: IMG(), className: 'h-40', content: <p>Editor's pick.</p> },
    { id: 4, src: IMG(), className: 'h-40', content: <p>Trending.</p> },
    { id: 5, src: IMG(), className: 'h-40', content: <p>New this week.</p> },
  ];

  const focusCards = ['Bars', 'Saunas', 'Cafés', 'Community'].map((title) => ({ src: IMG(), title }));

  const containerRef = React.useRef<HTMLDivElement>(null);
  const fromRef = React.useRef<HTMLDivElement>(null);
  const toRef = React.useRef<HTMLDivElement>(null);

  const stackItems = [
    { id: 1, content: <>"This is the safe-travel resource I wish I had a decade ago."</>, name: 'Alex F.', designation: 'Lagos → Berlin' },
    { id: 2, content: <>"Genuinely no other site has this many verified venues outside the West."</>, name: 'Mei T.', designation: 'Singapore' },
    { id: 3, content: <>"I run a Pride event. The community editing pipeline is honestly impressive."</>, name: 'Jordan R.', designation: 'Manchester' },
  ];

  const stickyContent = [
    { title: 'Step 1 — Find verified spaces.', description: <p>Venues, events, and people checked by humans, not algorithms.</p>, content: <div className="h-full w-full bg-muted flex items-center justify-center text-muted-foreground">Verified</div> },
    { title: 'Step 2 — Plan your visit.', description: <p>Build trips with friends, share itineraries, get on-the-ground tips.</p>, content: <div className="h-full w-full bg-muted flex items-center justify-center text-muted-foreground">Trips</div> },
    { title: 'Step 3 — Belong.', description: <p>Join groups, leave reviews, contribute back.</p>, content: <div className="h-full w-full bg-muted flex items-center justify-center text-muted-foreground">Community</div> },
  ];

  const parallaxProducts = Array.from({ length: 15 }).map((_, i) => ({
    title: `Story ${i + 1}`,
    link: '#',
    thumbnail: IMG(),
  }));

  const timelineData = [
    { title: '2021', content: <p>Side-project. Three contributors, one spreadsheet, big ambitions.</p> },
    { title: '2023', content: <p>1,000 venues, 80 cities. First Pride season survived without falling over.</p> },
    { title: '2025', content: <p>21,000 venues, 180 countries, 2,300 contributors.</p> },
    { title: '2026', content: <p>You are here. Help us write the next chapter.</p> },
  ];

  const slideImages = [IMG(), IMG(), IMG()];

  const tooltips = ['JK', 'AM', 'YS', 'LR'].map((initials, i) => ({ id: i, name: ['Jamie Knox', 'Anna Marin', 'Yusuf Shah', 'Lara Reyes'][i], designation: 'Contributor', initials }));

  return (
    <div className="min-h-screen relative">
      {/* Sticky nav of section anchors */}
      <nav className="sticky top-16 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md overflow-x-auto no-scrollbar">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 py-2 text-xs whitespace-nowrap">
          {[
            ['hero', 'Hero text'],
            ['backgrounds', 'Backgrounds'],
            ['cards', 'Cards'],
            ['carousels', 'Carousels'],
            ['text', 'Text'],
            ['parallax', 'Parallax'],
            ['interactive', 'Interactive'],
            ['layout', 'Layout'],
            ['cta', 'CTA'],
            ['exemption', 'A11y exemption'],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="px-3 py-1.5 rounded-badge hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              {label}
            </a>
          ))}
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section id="hero" className="relative min-h-[90vh] flex flex-col items-center justify-center px-4 overflow-hidden">
        <GrainOverlay />
        <div className="absolute inset-0 pointer-events-none">
          <Beams count={8} />
          <Sparkles density={60} />
          <Meteors number={12} />
          <ShootingStars minDelay={2200} maxDelay={5400} trailLength={120} />
          <div className="absolute inset-0 spotlight-radial" />
        </div>
        <div className="relative z-10 text-center max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">A tour of the design system</p>
          <TextGenerateEffect
            words="Aceternity, in black and white."
            className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.05]"
            as="h1"
            staggerDelay={0.07}
          />
          <div className="mt-5 text-lg md:text-xl text-muted-foreground">
            <span className="mr-1.5">A library of</span>
            <WordRotate className="text-foreground font-semibold" words={['51 effects', 'animated heroes', 'cursor magic', 'parallax stacks', 'every demo']} />
          </div>
          <div className="mt-8 flex gap-3 justify-center">
            <ShineButton onClick={() => setModalOpen(true)}>Open modal</ShineButton>
            <HoverBorderGradient onClick={() => setLoaderOpen(true)}>Show loader</HoverBorderGradient>
          </div>
        </div>
      </section>

      {/* ── Backgrounds ───────────────────────────────────────────── */}
      <Section id="backgrounds" title="Backgrounds" kicker="11 effects">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative h-60 rounded-container border border-border/60 overflow-hidden">
            <Vortex />
            <div className="absolute inset-0 flex items-center justify-center text-sm font-medium uppercase tracking-wider">Vortex</div>
          </div>
          <div className="relative h-60 rounded-container border border-border/60 overflow-hidden">
            <WavyBackground />
            <div className="absolute inset-0 flex items-center justify-center text-sm font-medium uppercase tracking-wider">WavyBackground</div>
          </div>
          <div className="relative h-60 rounded-container border border-border/60 overflow-hidden bg-grid-dots">
            <div className="absolute inset-0 flex items-center justify-center text-sm font-medium uppercase tracking-wider">bg-grid-dots</div>
          </div>
          <div className="relative h-60 rounded-container border border-border/60 overflow-hidden">
            <BackgroundLines className="opacity-100" />
            <div className="absolute inset-0 flex items-center justify-center text-sm font-medium uppercase tracking-wider">BackgroundLines</div>
          </div>
          <div className="relative h-60 rounded-container border border-border/60 overflow-hidden md:col-span-2">
            <div className="absolute inset-0 [mask-image:radial-gradient(transparent,white)] pointer-events-none">
              <Boxes />
            </div>
            <div className="relative z-10 h-full flex items-center justify-center">
              <div className="h-20"><TextHoverEffect text="BOXES" /></div>
            </div>
          </div>
          <div className="relative h-60 rounded-container border border-border/60 overflow-hidden">
            <LampEffect className="h-full">
              <span className="text-sm font-semibold tracking-tight">LampEffect</span>
            </LampEffect>
          </div>
          <div className="relative h-60 rounded-container border border-border/60 overflow-hidden">
            <SpotlightEffect className="h-full flex items-center justify-center">
              <span className="text-sm font-medium uppercase tracking-wider">SpotlightEffect</span>
            </SpotlightEffect>
          </div>
        </div>
      </Section>

      {/* ── Cards ─────────────────────────────────────────────────── */}
      <Section id="cards" title="Cards" kicker="9 variants">
        <BentoGrid>
          {[
            { titleKey: 'CardContainer3D', icon: MapPin },
            { titleKey: 'WobbleCard', icon: Calendar },
            { titleKey: 'PinContainer', icon: Compass },
            { titleKey: 'BackgroundGradient', icon: Heart },
            { titleKey: 'GlowingEffect', icon: SparklesIcon },
            { titleKey: 'CardHover spotlight', icon: Map },
            { titleKey: 'CardStack', icon: Users },
          ].map((f, i) => (
            <BentoGridItem key={f.titleKey} colSpan={i < 2 ? 2 : 1}>
              <div className="relative h-full">
                <GlowingEffect spread={220} intensity={0.25} />
                <CardContainer3D rotateRange={6} className="h-full" containerClassName="h-full">
                  <CardItem translateZ={26} className="font-bold flex items-center gap-2"><f.icon size={18} />{f.titleKey}</CardItem>
                  <CardItem translateZ={14} as="p" className="text-sm text-muted-foreground mt-2">Hover for parallax + glow.</CardItem>
                </CardContainer3D>
              </div>
            </BentoGridItem>
          ))}
        </BentoGrid>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <WobbleCard className="h-48">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">01 — WobbleCard</p>
            <h3 className="text-lg font-bold mt-1">Parallax wobble.</h3>
            <p className="text-sm text-muted-foreground mt-2">Container tilts, child counter-translates.</p>
          </WobbleCard>
          <PinContainer title="View" href="#" className="h-48 p-6">
            <h3 className="font-bold">PinContainer</h3>
            <p className="text-sm text-muted-foreground mt-2">Floating pin on hover.</p>
          </PinContainer>
          <BackgroundGradient className="h-48 p-6">
            <h3 className="font-bold">BackgroundGradient</h3>
            <p className="text-sm text-muted-foreground mt-2">Animated radial ring.</p>
          </BackgroundGradient>
        </div>

        <div className="mt-8 flex flex-col md:flex-row items-center gap-6">
          <CardStack
            items={stackItems.map((s) => ({ ...s, content: <p className="leading-relaxed">{s.content}</p> }))}
            className="md:w-96"
          />
          <div className="flex-1">
            <h3 className="font-bold text-lg">CardStack</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">Auto-shuffling deck of cards on a 5s interval. Useful for testimonials, quotes, tips.</p>
          </div>
        </div>
      </Section>

      {/* ── Carousels ────────────────────────────────────────────── */}
      <Section id="carousels" title="Carousels & rails" kicker="4 patterns">
        <div className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">AppleCardsCarousel</div>
        <AppleCardsCarousel items={carouselCards} />
        <div className="mt-12 mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">InfiniteMovingCards</div>
        <InfiniteMovingCards direction="left" speed="slow">
          {stackItems.map((s) => (
            <div key={s.id} className="w-72 shrink-0 rounded-container border border-border/60 bg-card p-5">
              <p className="text-sm leading-relaxed">{s.content}</p>
              <p className="mt-3 text-xs font-semibold">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.designation}</p>
            </div>
          ))}
        </InfiniteMovingCards>
        <div className="mt-12 mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">Marquee</div>
        <div className="border-y border-border/60 py-4 bg-muted/30 rounded-container">
          <Marquee speed={45}>
            {['VERIFIED SAFE SPACES', 'BUILT BY THE COMMUNITY', 'NO PAYWALLS', 'WORLDWIDE', '180+ COUNTRIES'].map((t) => (
              <span key={t} className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                <span className="h-1 w-1 rounded-full bg-foreground" aria-hidden />
                {t}
              </span>
            ))}
          </Marquee>
        </div>
        <div className="mt-12 mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">ImagesSlider</div>
        <div className="relative h-72 rounded-container overflow-hidden border border-border/60">
          <ImagesSlider images={slideImages}>
            <div className="h-full flex items-center justify-center">
              <p className="text-background text-3xl md:text-4xl font-extrabold tracking-tight">Auto-rotating.</p>
            </div>
          </ImagesSlider>
        </div>
      </Section>

      {/* ── Text effects ──────────────────────────────────────────── */}
      <Section id="text" title="Text effects" kicker="4 patterns">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-8 rounded-container bg-card border border-border/60">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">TextGenerateEffect</p>
            <TextGenerateEffect words="A field guide for queer travellers." className="text-2xl font-bold tracking-tight" />
          </div>
          <div className="p-8 rounded-container bg-card border border-border/60">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">WordRotate</p>
            <div className="text-2xl font-semibold">
              Find queer <WordRotate className="text-foreground" words={['venues', 'events', 'community']} />
            </div>
          </div>
          <div className="p-2 rounded-container bg-card border border-border/60 h-40 overflow-hidden">
            <TextHoverEffect text="HOVER" />
          </div>
          <TextRevealCard text="Move the handle." revealText="Reveal me." />
        </div>
      </Section>

      {/* ── Parallax / scroll ─────────────────────────────────────── */}
      <Section id="parallax" title="Parallax & scroll" kicker="6 patterns">
        <TracingBeam className="px-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">TracingBeam</p>
          <p className="max-w-prose text-sm text-foreground/90 leading-relaxed">
            Scroll this section to see the left-rail beam fill. The dot at the top fills in as the section
            enters the viewport. Pair with any long-form content — articles, FAQs, changelogs.
          </p>
        </TracingBeam>
        <div className="mt-12">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">StickyScroll</p>
          <StickyScroll content={stickyContent} />
        </div>
        <div className="mt-12">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Timeline</p>
          <Timeline data={timelineData} />
        </div>
        <div className="mt-12 -mx-4 sm:-mx-6 md:-mx-8">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 px-4 sm:px-6 md:px-8">HeroParallax</p>
          <HeroParallax products={parallaxProducts} title="Queer guide" subtitle="A field-built directory." />
        </div>
        <div className="mt-12">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">ContainerScroll</p>
          <ContainerScroll
            titleComponent={
              <div>
                <h3 className="text-2xl md:text-4xl font-extrabold tracking-tight">
                  Scroll to flatten.
                </h3>
                <p className="text-muted-foreground mt-2">Perspective panel rotates upright as you scroll.</p>
              </div>
            }
          >
            <div className="h-full w-full bg-grid-dots flex items-center justify-center">
              <p className="text-3xl font-extrabold text-muted-foreground">Screenshot mockup</p>
            </div>
          </ContainerScroll>
        </div>
      </Section>

      {/* ── Interactive ───────────────────────────────────────────── */}
      <Section id="interactive" title="Interactive" kicker="11 effects">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-container border border-border/60 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">FollowingPointer</p>
            <FollowingPointer title="Open">
              <div className="h-40 rounded-container bg-grid-dots flex items-center justify-center text-muted-foreground">
                Hover inside this card.
              </div>
            </FollowingPointer>
          </div>

          <div className="rounded-container border border-border/60 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">AnimatedTooltip</p>
            <AnimatedTooltip items={tooltips} />
          </div>

          <div className="rounded-container border border-border/60 p-6 md:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">LinkPreview</p>
            <p className="text-sm">
              The Queer Guide team publishes a monthly{' '}
              <LinkPreview href="#" imageSrc={IMG()}>community update</LinkPreview>. Hover the link.
            </p>
          </div>

          <div className="rounded-container border border-border/60 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">DraggableCardBody</p>
            <DraggableCardContainer className="h-40 flex items-center justify-center">
              <DraggableCardBody className="px-6 py-4">
                <p className="text-sm font-medium">Drag me anywhere.</p>
                <p className="text-xs text-muted-foreground mt-1">Physics-based return.</p>
              </DraggableCardBody>
            </DraggableCardContainer>
          </div>

          <div className="rounded-container border border-border/60 p-6 overflow-hidden">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Lens</p>
            <Lens className="h-40 rounded-container">
              <img src={IMG()} alt="" className="w-full h-full object-cover" />
            </Lens>
          </div>

          <div className="rounded-container border border-border/60 p-6 md:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Compare</p>
            <Compare firstImage={IMG()} secondImage={IMG()} firstAlt="Before" secondAlt="After" className="h-60" />
          </div>

          <div ref={containerRef} className="relative rounded-container border border-border/60 p-8 md:col-span-2 h-60 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground absolute top-4 left-4">AnimatedBeam</p>
            <div ref={fromRef} className="h-14 w-14 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold relative z-10">A</div>
            <div ref={toRef} className="h-14 w-14 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold relative z-10">B</div>
            <AnimatedBeam containerRef={containerRef} fromRef={fromRef} toRef={toRef} curvature={-50} />
          </div>
        </div>
      </Section>

      {/* ── Layout patterns ───────────────────────────────────────── */}
      <Section id="layout" title="Layout patterns" kicker="3 patterns">
        <div className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">FocusCards</div>
        <FocusCards cards={focusCards} />
        <div className="mt-12 mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">ExpandableCard (click)</div>
        <ExpandableCard items={expandableItems} />
        <div className="mt-12 mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">LayoutGrid (click)</div>
        <LayoutGrid cards={layoutCards} />
      </Section>

      {/* ── CTAs & buttons ────────────────────────────────────────── */}
      <Section id="cta" title="CTAs & chrome" kicker="6 patterns">
        <div className="flex flex-wrap items-center gap-4">
          <ShineButton onClick={() => setModalOpen(true)}>ShineButton</ShineButton>
          <HoverBorderGradient onClick={() => setLoaderOpen(true)}>HoverBorderGradient</HoverBorderGradient>
          <MovingBorder onClick={() => {}} duration={4}>MovingBorder</MovingBorder>
          <button className="shine-on-hover px-5 py-2.5 rounded-element bg-foreground text-background text-sm font-medium">.shine-on-hover</button>
        </div>
        <div className="mt-8 p-6 rounded-container border border-border/60 bg-card">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">NavbarMenu</p>
          <NavbarMenu>
            <NavbarMenuItem item="Venues">
              <div className="grid gap-1 w-56">
                <NavbarHoveredLink href="#" description="Bars, clubs, saunas">Browse venues</NavbarHoveredLink>
                <NavbarHoveredLink href="#" description="On a map">Open map</NavbarHoveredLink>
              </div>
            </NavbarMenuItem>
            <NavbarMenuItem item="Events">
              <div className="grid gap-1 w-56">
                <NavbarHoveredLink href="#" description="This week">Festivals</NavbarHoveredLink>
                <NavbarHoveredLink href="#" description="14-day view">Calendar</NavbarHoveredLink>
              </div>
            </NavbarMenuItem>
            <NavbarMenuItem item="Resources" />
          </NavbarMenu>
        </div>
        <div className="mt-12">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">WorldMap</p>
          <WorldMap
            dots={[
              { start: { lat: 40.7128, lng: -74.006 }, end: { lat: 51.5072, lng: -0.1276 } },
              { start: { lat: 51.5072, lng: -0.1276 }, end: { lat: 35.6762, lng: 139.6503 } },
              { start: { lat: -33.8688, lng: 151.2093 }, end: { lat: 13.7563, lng: 100.5018 } },
              { start: { lat: -22.9068, lng: -43.1729 }, end: { lat: -33.9249, lng: 18.4241 } },
            ]}
          />
        </div>
      </Section>

      {/* ── §10 Animation exemption — crisis & safety pages ───────── */}
      <Section id="exemption" title="A11y exemption — animation-free pages" kicker="Source of truth">
        <div role="note" aria-labelledby="exemption-policy" className="border-2 border-foreground p-6 mb-8 bg-card">
          <p id="exemption-policy" className="text-xs font-semibold uppercase tracking-wider mb-2">Policy</p>
          <p className="text-sm leading-relaxed">
            <strong>Crisis & safety pages are animation-free.</strong>{' '}
            <a href="https://github.com/" className="underline">src/pages/HelpHotlines.tsx</a>{' '}
            (and any future <code>/help/*</code>, <code>/safety/*</code>, <code>/report-*</code> routes) must not consume
            Aceternity components, scroll-reveal effects, or decorative motion. Functional motion only
            (focus rings, dialog transitions, accordions). Protects users in crisis from cognitive overload
            and respects <code>prefers-reduced-motion</code> (WCAG 2.3.3).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: a typical animated showcase card */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              ✗ Showcase pattern — do NOT use on crisis pages
            </p>
            <div className="relative h-60 rounded-container border border-border/60 overflow-hidden">
              <SpotlightEffect className="h-full flex items-center justify-center">
                <span className="text-sm font-medium uppercase tracking-wider">Animated card</span>
              </SpotlightEffect>
            </div>
            <ul className="mt-3 text-xs text-muted-foreground space-y-1">
              <li>• Spotlight follows cursor</li>
              <li>• Hover-driven motion</li>
              <li>• Decorative effects layered</li>
            </ul>
          </div>

          {/* Right: a static, high-contrast hotline card matching HelpHotlines */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              ✓ Crisis card — match this on /help, /safety, /report-*
            </p>
            <article
              className="h-60 rounded-container border-2 border-foreground bg-background p-6 flex flex-col justify-between"
              aria-label="Example crisis hotline (static)"
            >
              <div>
                <h3 className="text-lg font-bold tracking-tight">Trans Lifeline</h3>
                <p className="text-sm text-muted-foreground mt-1">24/7 peer support, by and for trans people.</p>
              </div>
              <a
                href="tel:+18005655463"
                className="inline-flex items-center justify-center rounded-element bg-foreground text-background px-4 py-3 text-sm font-semibold underline-offset-2"
              >
                Call +1 (877) 565-8860
              </a>
            </article>
            <ul className="mt-3 text-xs text-muted-foreground space-y-1">
              <li>• Zero animation</li>
              <li>• Maximum contrast (2px foreground border)</li>
              <li>• Phone number is the primary affordance</li>
            </ul>
          </div>
        </div>

        <p className="mt-8 text-xs text-muted-foreground max-w-prose">
          Reference: <code>CLAUDE.md → Design → Documented exceptions</code>. PRs that introduce Aceternity
          components, scroll reveals, or decorative animations on crisis routes must be rejected.
        </p>
      </Section>

      {/* Modals & overlays */}
      <AnimatedModal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div>
          <h3 className="text-xl font-bold tracking-tight">AnimatedModal</h3>
          <p className="text-sm text-muted-foreground mt-1">Door-opening 3D rotateX with backdrop blur.</p>
          <button
            onClick={() => setModalOpen(false)}
            className="mt-5 inline-flex items-center justify-center rounded-element bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            Close
          </button>
        </div>
      </AnimatedModal>
      <MultiStepLoader loadingStates={loadingStates} loading={loaderOpen} duration={1400} onFinish={() => setTimeout(() => setLoaderOpen(false), 800)} />
    </div>
  );
}
