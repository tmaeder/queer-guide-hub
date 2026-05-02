import { useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface SuggestionCardProps {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  priceLabel?: string | null;
  provider: string;
  ctaLabel: string;
  onImpression?: () => void;
  onCtaClick: () => void;
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  compact?: boolean;
}

export function SuggestionCard({
  title,
  subtitle,
  description,
  imageUrl,
  priceLabel,
  provider,
  ctaLabel,
  onImpression,
  onCtaClick,
  secondaryAction,
  compact,
}: SuggestionCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!onImpression || firedRef.current) return;
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            timer = setTimeout(() => {
              if (!firedRef.current) {
                firedRef.current = true;
                onImpression();
                observer.disconnect();
              }
            }, 500);
          } else if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [onImpression]);

  return (
    <Card ref={ref} hoverable className={compact ? '' : 'h-full'}>
      <CardContent>
        <div className="flex flex-col gap-2 h-full">
          {imageUrl && (
            <div
              className="w-full bg-muted"
              style={{
                aspectRatio: '16/10',
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
              role="img"
              aria-label={title}
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline">{provider}</Badge>
            {priceLabel && <p className="text-sm font-bold">{priceLabel}</p>}
          </div>
          <p className="text-sm font-bold leading-tight">{title}</p>
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
          {description && (
            <p
              className="text-xs text-muted-foreground"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {description}
            </p>
          )}
          <div className="mt-auto flex gap-2">
            <Button variant="brand" size="sm" className="flex-1" onClick={onCtaClick}>
              {ctaLabel}
              <ExternalLink size={14} style={{ marginLeft: 6 }} />
            </Button>
            {secondaryAction && (
              <Button
                variant="outline"
                size="sm"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
