import { Image } from 'queer-guide';
import { Landmark } from 'lucide-react';
import { StaticState } from './_static';

// Deterministic placeholder photo (no network in static capture).
const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#e5e5e5"/><circle cx="500" cy="110" r="48" fill="#d4d4d4"/><path d="M0 400 L220 180 L360 320 L460 230 L640 400 Z" fill="#cfcfcf"/></svg>`,
  );

export const CardCover = () => (
  <div className="w-80">
    <StaticState />
    <Image src={PHOTO} alt="Rooftop bar at sunset, Barcelona" aspect="card" rounded="container" />
  </div>
);

export const AspectVariants = () => (
  <div className="max-w-md space-y-4">
    <StaticState />
    <Image src={PHOTO} alt="Pride parade crowd, hero crop" aspect="hero" rounded="element" />
    <div className="flex gap-4">
      <div className="w-32">
        <Image src={PHOTO} alt="Portrait crop" aspect="portrait" rounded="element" />
      </div>
      <div className="w-32">
        <Image src={PHOTO} alt="Square thumbnail" aspect="square" rounded="element" />
      </div>
    </div>
  </div>
);

export const WithScrimOverlay = () => (
  <div className="w-80">
    <StaticState />
    <Image src={PHOTO} alt="Canal houses in Amsterdam at dusk" aspect="card" rounded="container" scrim="readable">
      <div className="absolute bottom-0 left-0 p-4">
        <p className="text-15 font-semibold text-white">Amsterdam</p>
        <p className="text-13 text-white/80">312 venues · 48 events</p>
      </div>
    </Image>
  </div>
);

export const IconFallback = () => (
  <div className="w-80">
    <StaticState />
    <Image
      alt="No photo available for this museum"
      aspect="card"
      rounded="container"
      fallbackIcon={Landmark}
    />
  </div>
);
