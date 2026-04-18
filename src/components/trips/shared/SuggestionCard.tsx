import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
  /** Called once when the card enters the viewport (IntersectionObserver, 500ms debounce). */
  onImpression?: () => void;
  /** Called when user clicks the primary CTA — must return a URL or navigate. */
  onCtaClick: () => void;
  /** Optional secondary action (e.g. "Add to checklist" for packing cards). */
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  compact?: boolean;
}

/**
 * Shared suggestion card used by Reservations + Packing panels.
 * Fires a single impression event when scrolled into view.
 */
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
          {imageUrl && (
            <Box
              sx={{
                width: '100%',
                aspectRatio: '16/10',
                bgcolor: 'action.hover',
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: 1,
              }}
              role="img"
              aria-label={title}
            />
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Badge variant="outline">{provider}</Badge>
            {priceLabel && (
              <Typography variant="body2" fontWeight={700}>
                {priceLabel}
              </Typography>
            )}
          </Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
          {description && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {description}
            </Typography>
          )}
          <Box sx={{ mt: 'auto', display: 'flex', gap: 1 }}>
            <Button
              variant="brand"
              size="sm"
              className="flex-1"
              onClick={onCtaClick}
            >
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
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
