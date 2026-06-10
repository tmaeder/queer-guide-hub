import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Heart, ShieldCheck, Globe, Users } from 'lucide-react';
import { DonationForm } from '@/components/donate/DonationForm';
import { DonorWall } from '@/components/donate/DonorWall';
import { DonationSuccess } from '@/components/donate/DonationSuccess';
import { ColourfulText } from '@/components/effects/ColourfulText';
import { BentoGrid, BentoGridItem } from '@/components/effects/BentoGrid';
import { Marquee } from '@/components/effects/Marquee';
import { EditorialHero } from '@/components/editorial/EditorialHero';
import { EDITORIAL_IMAGES } from '@/lib/editorialImages';

const IMPACT = [
  {
    icon: ShieldCheck,
    title: 'Verified safe spaces',
    description: 'We pay moderators and community ambassadors to vet every venue.',
  },
  {
    icon: Users,
    title: 'Free for everyone',
    description: 'No paywalls, no ads, no premium tier. Your support keeps the platform open.',
  },
  {
    icon: Globe,
    title: 'Independent + global',
    description: 'No investors steering the roadmap — just the community and 180+ countries served.',
  },
];

const MARQUEE_THANKS = [
  'Thanks to our supporters.',
  'Built with the community.',
  'Free for everyone, forever.',
  'No paywalls. No ads.',
  '180+ countries served.',
];

export default function Donate() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const donateImages = EDITORIAL_IMAGES.donate;
  const impactImages = donateImages.extras ?? [];

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <EditorialHero
        eyebrow="Donate"
        title={<ColourfulText text={t('donate.title', 'Support queer.guide')} />}
        subtitle={t(
          'donate.subtitle',
          'queer.guide is a free platform connecting the LGBTQ+ community with safe spaces, events, and resources worldwide. Your donation helps us keep it running and accessible to everyone.',
        )}
        image={donateImages.hero}
        imagePosition="cover"
        decoration="grid"
        height="lg"
        className="mb-12 md:mb-16"
      >
        <div className="flex items-center gap-2 text-white/90">
          <Heart className="w-4 h-4" aria-hidden="true" />
          <span className="text-sm font-medium uppercase tracking-wider">
            100% to platform costs and community programs
          </span>
        </div>
      </EditorialHero>

      {/* Where your support goes */}
      <section className="mb-12 md:mb-16">
        <h2 className="font-bold mb-2 text-headline md:text-display">Where your support goes</h2>
        <p className="text-muted-foreground mb-8 md:mb-10 text-body-lg leading-[1.7] max-w-[640px]">
          We're a small team and a global community. Every donation goes directly to running the
          platform — and the people who keep it safe.
        </p>

        <BentoGrid className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {IMPACT.map((item, idx) => {
            const Icon = item.icon;
            const image = impactImages[idx];
            return (
              <BentoGridItem
                key={item.title}
                className="rounded-container p-0 overflow-hidden"
              >
                {image ? (
                  <ImpactImageTile
                    image={image}
                    Icon={Icon}
                    title={item.title}
                    description={item.description}
                  />
                ) : (
                  <div className="flex flex-col gap-4 p-6 md:p-8 h-full">
                    <Icon size={20} aria-hidden="true" />
                    <p className="font-bold text-body-lg">{item.title}</p>
                    <p className="text-sm text-muted-foreground leading-[1.6]">
                      {item.description}
                    </p>
                  </div>
                )}
              </BentoGridItem>
            );
          })}
        </BentoGrid>
      </section>

      {/* Marquee — quiet reaffirmation strip */}
      <div className="mb-12 md:mb-16 py-6 border-y border-border">
        <Marquee speed={60} className="text-muted-foreground">
          {MARQUEE_THANKS.map((line) => (
            <span
              key={line}
              className="text-xs2 font-semibold uppercase tracking-widest whitespace-nowrap"
            >
              {line}
              <span className="mx-6 opacity-40" aria-hidden="true">·</span>
            </span>
          ))}
        </Marquee>
      </div>

      {status === 'success' ? (
        <div className="mx-auto">
          <DonationSuccess />
        </div>
      ) : (
        <>
          <div className="mx-auto mb-12">
            <DonationForm />
          </div>
          <div className="mx-auto">
            <p className="block text-center mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t('donate.donorWall', 'Recent supporters')}
            </p>
            <DonorWall />
          </div>
        </>
      )}
    </div>
  );
}

interface ImpactImageTileProps {
  image: { src: string; alt: string; fallback?: string; credit?: string };
  Icon: typeof Heart;
  title: string;
  description: string;
}

function ImpactImageTile({ image, Icon, title, description }: ImpactImageTileProps) {
  const [src, setSrc] = useState(image.src);
  const [errored, setErrored] = useState(false);
  return (
    <div className="relative h-full min-h-[260px] overflow-hidden">
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
        className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/15 to-black/65 dark:from-black/35 dark:to-black/[0.78]"
      />
      <div className="relative z-[1] flex h-full flex-col justify-end gap-2 p-6 md:p-8 text-white">
        <Icon size={20} aria-hidden="true" />
        <p className="font-bold text-body-lg">{title}</p>
        <p className="text-sm text-white/90 leading-[1.6]">{description}</p>
      </div>
    </div>
  );
}
