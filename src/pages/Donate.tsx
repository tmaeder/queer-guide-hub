import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Heart, ShieldCheck, Globe, Users } from 'lucide-react';
import { DonationForm } from '@/components/donate/DonationForm';
import { DonorWall } from '@/components/donate/DonorWall';
import { DonationSuccess } from '@/components/donate/DonationSuccess';
import { EditorialHero } from '@/components/editorial/EditorialHero';
import { EDITORIAL_IMAGES, type EditorialImage } from '@/lib/editorialImages';
import { PageContainer } from '@/components/layout/PageContainer';

/**
 * What a donation actually pays for.
 *
 * The first item read "We pay moderators and community ambassadors to vet
 * every venue" and was false in all three of its claims. Measured against
 * prod on 2026-09-05: one moderator, zero community ambassadors (the
 * programme exists nowhere in the product — `ambassador` appears in `src/`
 * only as a gamification tier), and zero venue reviews against 26,905
 * venues, so nothing is "vetted" in the sense a reader would understand.
 * This is a donation page, so that is a statement about where someone's
 * money goes, which is a materially worse thing to get wrong than the same
 * sentence on /about.
 *
 * What replaced it is the safety work that demonstrably runs: 1,348 venues
 * and 61 events are withheld from anonymous visitors in countries that
 * criminalise us, and every country page carries its legal status.
 *
 * The claims NOT made here are deliberate. There is no figure for how
 * donations are split, and the hero's "100% to platform costs and community
 * programs" is gone with it: the "community programs" named nothing that
 * exists, and the allocation is not something this repo can evidence. An
 * unverifiable promise about money is the one kind of copy that should fail
 * closed. "180+ countries" stays because it is true and conservative —
 * 191 countries currently have at least one venue.
 */
const IMPACT = [
  {
    icon: ShieldCheck,
    title: 'Safety that costs money',
    description:
      'Rights and risk data for every country, and listings hidden from anonymous visitors where being out is dangerous.',
  },
  {
    icon: Users,
    title: 'Free for everyone',
    description: 'No paywalls, no ads, no premium tier. Your support keeps the platform open.',
  },
  {
    icon: Globe,
    title: 'Independent + global',
    description:
      'No investors steering the roadmap. Venues in 180+ countries, and the data behind them credited source by source.',
  },
];

export default function Donate() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const donateImages = EDITORIAL_IMAGES.donate;
  const impactImages = donateImages.extras ?? [];

  return (
    <PageContainer>
      <div>
        <EditorialHero
          eyebrow="Donate"
          title={t('donate.title', 'Support queer.guide')}
          subtitle={t(
            'donate.subtitle',
            'queer.guide is a free platform connecting the LGBTQ+ community with safe spaces, events, and resources worldwide. Your donation helps us keep it running and accessible to everyone.',
          )}
          image={donateImages.hero}
          imagePosition="cover"
          decoration="grid"
          height="lg"
        >
          {/* "100% to platform costs and community programs" stood here. The
              programmes it named do not exist, and the allocation is not
              something this repo can evidence — see the note on IMPACT. A
              claim about where a stranger's money goes fails closed. */}
          <div className="flex items-center gap-2 text-white/90">
            <Heart className="w-4 h-4" aria-hidden="true" />
            <span className="text-13 font-medium uppercase tracking-label">
              No ads. No paywall. No premium tier.
            </span>
          </div>
        </EditorialHero>

        {/* Where your support goes */}
        <section className="mt-16 md:mt-24">
          <h2 className="font-bold text-headline md:text-display">Where your support goes</h2>
          <p className="mt-4 text-body-lg leading-[1.6] text-muted-foreground max-w-prose">
            We're a small team and a global community. Every donation goes directly to running the
            platform — and the people who keep it safe.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {IMPACT.map((item, idx) => {
              const image = impactImages[idx];
              return image ? (
                <ImpactImageTile
                  key={item.title}
                  image={image}
                  Icon={item.icon}
                  title={item.title}
                  description={item.description}
                />
              ) : (
                <div
                  key={item.title}
                  className="flex flex-col gap-2 rounded-container bg-card p-6 md:p-8"
                >
                  <item.icon size={18} className="text-muted-foreground" aria-hidden="true" />
                  <p className="font-bold text-body-lg">{item.title}</p>
                  <p className="text-15 leading-[1.6] text-muted-foreground">{item.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Give */}
        <section className="mt-16 md:mt-24 pt-12 md:pt-16">
          {status === 'success' ? (
            <div className="max-w-2xl mx-auto">
              <DonationSuccess />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-10 lg:gap-16 items-start">
              <div>
                <h2 className="font-bold text-headline md:text-display">Make a donation</h2>
                <p className="mt-4 text-body-lg leading-[1.6] text-muted-foreground max-w-prose">
                  Give once or monthly. Every amount keeps Queer Guide free and ad-free.
                </p>
                <div className="mt-6">
                  <DonationForm />
                </div>
              </div>

              <aside className="lg:sticky lg:top-24">
                <p className="text-13 font-semibold uppercase tracking-label text-muted-foreground">
                  {t('donate.donorWall', 'Recent supporters')}
                </p>
                <div className="mt-4">
                  <DonorWall />
                </div>
              </aside>
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function ImpactImageTile({
  image,
  Icon,
  title,
  description,
}: {
  image: EditorialImage;
  Icon: typeof Heart;
  title: string;
  description: string;
}) {
  const [src, setSrc] = useState(image.src);
  const [errored, setErrored] = useState(false);
  return (
    <div className="relative min-h-[240px] overflow-hidden rounded-container">
      { }
      <img
        src={src}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (image.fallback) setSrc(image.fallback);
          setErrored(true);
        }}
        className="absolute inset-0 h-full w-full object-cover"
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
        <Icon size={18} aria-hidden="true" />
        <p className="font-bold text-body-lg">{title}</p>
        <p className="text-15 leading-[1.6] text-white/85">{description}</p>
      </div>
    </div>
  );
}
