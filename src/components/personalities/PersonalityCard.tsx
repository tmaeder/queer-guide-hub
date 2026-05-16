import { useEffect, useRef, useState } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import type { Personality } from '@/hooks/usePersonalities';

const HOVER_OPEN_MS = 350;
const HOVER_CLOSE_MS = 120;

interface PersonalityCardProps {
  personality?: Personality;
  loading?: boolean;
  onClick?: () => void;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatEra(p: Personality): string | null {
  if (p.is_living) return 'Living';
  const birthYear = p.birth_date ? new Date(p.birth_date).getFullYear() : null;
  const deathYear = p.death_date ? new Date(p.death_date).getFullYear() : null;
  if (birthYear && deathYear) return `${birthYear}–${deathYear}`;
  if (birthYear) return `b. ${birthYear}`;
  if (deathYear) return `d. ${deathYear}`;
  return 'Historical';
}

export function PersonalityCardSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="relative w-full bg-muted" style={{ paddingTop: '133.33%' }}>
        <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
      </div>
      <div className="p-3">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-4 w-[55%] mb-2" />
        <Skeleton className="h-4 w-[65%]" />
      </div>
    </div>
  );
}

export function PersonalityCard({ personality, loading, onClick }: PersonalityCardProps) {
  const [imgError, setImgError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (loading || !personality) {
    return <PersonalityCardSkeleton />;
  }

  const era = formatEra(personality);
  const showImage = Boolean(personality.image_url) && !imgError;
  const metaParts = [era, personality.nationality].filter(Boolean) as string[];
  const ariaLabel = personality.profession
    ? `${personality.name}, ${personality.profession}`
    : personality.name;
  const href = `/personalities/${personality.slug ?? personality.id}`;

  const scheduleOpen = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (previewOpen) return;
    openTimerRef.current = window.setTimeout(() => setPreviewOpen(true), HOVER_OPEN_MS);
  };
  const scheduleClose = () => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    closeTimerRef.current = window.setTimeout(() => setPreviewOpen(false), HOVER_CLOSE_MS);
  };

  const previewText = personality.description || personality.bio;
  // Mouse-only preview: pointer:fine excludes touch, where the long-press
  // alternative would interfere with native link tap. Touch users still get
  // the inline snippet on the card body.
  const isFinePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const card = (
    <LocalizedLink
      to={href}
      onClick={onClick}
      onMouseEnter={isFinePointer ? scheduleOpen : undefined}
      onMouseLeave={isFinePointer ? scheduleClose : undefined}
      onFocus={isFinePointer ? scheduleOpen : undefined}
      onBlur={isFinePointer ? scheduleClose : undefined}
      aria-label={ariaLabel}
      className="personality-card group relative flex flex-col h-full cursor-pointer no-underline text-inherit bg-background overflow-hidden touch-manipulation transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <CardHoverEffect>
      {/* Image */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          paddingTop: '133.33%',
          background:
            'linear-gradient(135deg, hsl(var(--foreground) / 0.18) 0%, hsl(var(--foreground) / 0.10) 100%)',
        }}
      >
        {showImage ? (
          <img
            src={personality.image_url}
            alt={personality.name}
            role="presentation"
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setImgError(true)}
            className="personality-card-image absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-[72px] h-[72px] rounded-full bg-background flex items-center justify-center font-bold text-foreground shadow"
            >
              {getInitials(personality.name)}
            </div>
          </div>
        )}

        {personality.is_featured && (
          <div
            className="absolute top-2 right-2 flex items-center gap-1 px-2 py-[3px] rounded-full bg-background text-foreground shadow pointer-events-none select-none"
            style={{ backdropFilter: 'blur(4px)', fontSize: '0.75rem', fontWeight: 600 }}
          >
            <Star size={12} fill="hsl(var(--foreground))" color="hsl(var(--foreground))" aria-hidden="true" />
            <span>Featured</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex-grow">
        <h3
          className="text-foreground overflow-hidden text-ellipsis whitespace-nowrap"
          style={{
            fontWeight: 600,
            fontSize: '0.95rem',
            lineHeight: 1.3,
          }}
        >
          {personality.name}
        </h3>
        {personality.profession && (
          <p
            className="text-muted-foreground mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ fontSize: '0.8125rem' }}
          >
            {personality.profession}
          </p>
        )}
        {metaParts.length > 0 && (
          <p
            className="text-muted-foreground mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ fontSize: '0.75rem', opacity: 0.85 }}
          >
            {metaParts.join(' · ')}
          </p>
        )}
        {(personality.description || personality.bio) && (
          <p
            className="text-muted-foreground mt-1.5"
            style={{
              fontSize: '0.75rem',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {personality.description || personality.bio}
          </p>
        )}
      </div>
      </CardHoverEffect>
    </LocalizedLink>
  );

  if (!isFinePointer) return card;

  return (
    <Popover open={previewOpen} onOpenChange={setPreviewOpen}>
      <PopoverAnchor asChild>{card}</PopoverAnchor>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-72 p-0 overflow-hidden"
        onMouseEnter={() => {
          if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
        }}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {showImage ? (
          <img
            src={personality.image_url}
            alt=""
            loading="lazy"
            className="w-full h-40 object-cover bg-muted"
          />
        ) : (
          <div className="w-full h-24 bg-muted flex items-center justify-center text-3xl font-bold text-muted-foreground">
            {getInitials(personality.name)}
          </div>
        )}
        <div className="p-3 space-y-1.5">
          <div className="text-sm font-semibold leading-snug">{personality.name}</div>
          {personality.profession && (
            <div className="text-xs text-muted-foreground">{personality.profession}</div>
          )}
          {metaParts.length > 0 && (
            <div className="text-[11px] text-muted-foreground/80">
              {metaParts.join(' · ')}
            </div>
          )}
          {previewText && (
            <p
              className="text-xs text-muted-foreground pt-1"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 5,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {previewText}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
