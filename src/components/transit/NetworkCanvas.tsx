import { cn } from '@/lib/utils';
import type { JourneyTrack } from '@/components/layout/routeJourney';

const TRACKS: Array<{ track: JourneyTrack; d: string }> = [
  {
    track: 'pink',
    d: 'M -80 170 C 250 140 340 420 700 400 C 1030 382 1180 105 1680 150',
  },
  {
    track: 'blue',
    d: 'M -80 420 C 250 455 430 230 760 270 C 1080 308 1240 575 1680 535',
  },
  {
    track: 'green',
    d: 'M -80 680 C 230 650 430 835 730 810 C 1040 784 1220 620 1680 655',
  },
  {
    track: 'yellow',
    d: 'M -80 875 C 340 900 520 690 860 720 C 1210 750 1360 915 1680 880',
  },
];

export function NetworkBackdrop({ activeTrack }: { activeTrack: JourneyTrack }) {
  return (
    <div className={cn('network-backdrop', `network-backdrop--${activeTrack}`)} aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="presentation">
        {TRACKS.map(({ track, d }) => (
          <path
            key={track}
            className={`network-backdrop__track network-track--${track}`}
            d={d}
            pathLength="1"
          />
        ))}
        <g className="network-backdrop__stations">
          <circle cx="355" cy="322" r="12" />
          <circle cx="700" cy="400" r="18" className="network-backdrop__interchange" />
          <circle cx="1135" cy="180" r="12" />
          <circle cx="1240" cy="575" r="12" />
          <circle cx="730" cy="810" r="12" />
        </g>
      </svg>
    </div>
  );
}

export function HeroNetwork() {
  return (
    <div className="hero-network" aria-hidden="true">
      <svg viewBox="0 0 1440 300" preserveAspectRatio="none" role="presentation">
        <g className="hero-network__tracks">
          <path
            pathLength="1"
            className="network-track--pink"
            d="M -40 84 C 270 42 390 218 720 176 C 1000 142 1160 48 1480 76"
          />
          <path
            pathLength="1"
            className="network-track--blue"
            d="M -40 238 C 290 250 410 72 720 166 C 1030 258 1180 210 1480 220"
          />
          <path
            pathLength="1"
            className="network-track--green"
            d="M -40 164 C 290 132 450 188 720 172 C 1010 154 1220 116 1480 150"
          />
          <path
            pathLength="1"
            className="network-track--yellow"
            d="M -40 260 C 250 292 480 214 720 182 C 980 146 1210 280 1480 258"
          />
        </g>
        <g className="hero-network__stations">
          <circle cx="360" cy="128" r="11" />
          <circle cx="720" cy="174" r="20" className="hero-network__interchange" />
          <circle cx="1040" cy="134" r="11" />
        </g>
      </svg>
      <span className="hero-network__label hero-network__label--start">You are here</span>
      <span className="hero-network__label hero-network__label--interchange">Intersection</span>
      <span className="hero-network__label hero-network__label--end">Community</span>
    </div>
  );
}
