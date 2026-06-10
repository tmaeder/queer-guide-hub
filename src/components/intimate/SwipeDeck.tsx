import { useEffect, useState } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  useReducedMotion,
  type PanInfo,
} from 'motion/react';
import { Heart, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SwipeableCard {
  id: string;
  avatar_url?: string | null;
  display_name?: string | null;
  age_band?: string | null;
  body_type?: string | null;
  height_cm?: number | null;
  role?: string[] | null;
}

interface SwipeDeckProps {
  cards: SwipeableCard[];
  onLike: (id: string) => void;
  onPass: (id: string) => void;
  className?: string;
}

const SWIPE_THRESHOLD_PX = 90;

/**
 * Card-stack discovery UI. Top card is interactive: drag horizontally to
 * pass (left) or like (right); release past the threshold to commit.
 * Keyboard: ArrowLeft = pass, ArrowRight = like.
 *
 * prefers-reduced-motion: drag is still allowed (functional) but the
 * spring physics and rotation are flattened. Background cards do not
 * animate scale.
 */
export function SwipeDeck({ cards, onLike, onPass, className }: SwipeDeckProps) {
  const [topId, setTopId] = useState<string | null>(cards[0]?.id ?? null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], reduced ? [0, 0, 0] : [-12, 0, 12]);
  const likeOpacity = useTransform(x, [0, SWIPE_THRESHOLD_PX], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_THRESHOLD_PX, 0], [1, 0]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setTopId(cards[0]?.id ?? null);
    x.set(0);
  }, [cards, x]);

  useEffect(() => {
    if (!topId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        onPass(topId);
      } else if (e.key === 'ArrowRight') {
        onLike(topId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [topId, onLike, onPass]);

  const onDragEnd = (_e: unknown, info: PanInfo) => {
    if (!topId) return;
    if (info.offset.x > SWIPE_THRESHOLD_PX) {
      onLike(topId);
    } else if (info.offset.x < -SWIPE_THRESHOLD_PX) {
      onPass(topId);
    }
    x.set(0);
  };

  if (cards.length === 0) {
    return (
      <div
        className={cn(
          'flex h-96 items-center justify-center rounded-container border border-dashed border-border p-6 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        No more profiles. Try widening filters or come back later.
      </div>
    );
  }

  const visible = cards.slice(0, 3);

  return (
    <div className={cn('flex flex-col items-center gap-6', className)}>
      <div className="relative h-[480px] w-full max-w-sm">
        {visible.map((card, i) => {
          const isTop = i === 0;
          return (
            <motion.div
              key={card.id}
              className={cn(
                'absolute inset-0 flex flex-col gap-4 overflow-hidden rounded-container border border-border bg-card p-4 select-none',
                isTop ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none',
              )}
              style={isTop ? { x, rotate, zIndex: 10 } : { zIndex: 10 - i }}
              animate={isTop ? undefined : reduced ? undefined : { scale: 1 - i * 0.03, y: i * 8 }}
              drag={isTop ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.8}
              onDragEnd={isTop ? onDragEnd : undefined}
              aria-hidden={!isTop}
            >
              {card.avatar_url ? (
                <img
                  src={card.avatar_url}
                  alt=""
                  className="aspect-square w-full rounded-element object-cover"
                  draggable={false}
                />
              ) : (
                <div className="aspect-square w-full rounded-element bg-muted" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold truncate">{card.display_name ?? 'Anon'}</p>
                <p className="text-13 text-muted-foreground truncate">
                  {[card.age_band, card.body_type, card.height_cm ? `${card.height_cm}cm` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {card.role?.length ? (
                  <p className="mt-1 text-13 text-muted-foreground truncate">
                    {card.role.join(', ')}
                  </p>
                ) : null}
              </div>
              {isTop && (
                <>
                  <motion.div
                    style={{ opacity: likeOpacity }}
                    className="pointer-events-none absolute top-4 right-4 rounded-badge border-2 border-foreground bg-background/90 px-2.5 py-1 text-sm font-bold uppercase tracking-wider"
                  >
                    Like
                  </motion.div>
                  <motion.div
                    style={{ opacity: passOpacity }}
                    className="pointer-events-none absolute top-4 left-4 rounded-badge border-2 border-foreground bg-background/90 px-2.5 py-1 text-sm font-bold uppercase tracking-wider"
                  >
                    Pass
                  </motion.div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => topId && onPass(topId)}
          aria-label="Pass"
          className="rounded-element h-14 w-14 p-0"
        >
          <X className="h-6 w-6" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="default"
          size="lg"
          onClick={() => topId && onLike(topId)}
          aria-label="Like"
          className="rounded-element h-14 w-14 p-0"
        >
          <Heart className="h-6 w-6" aria-hidden />
        </Button>
      </div>

      <p className="text-13 text-muted-foreground" aria-live="polite">
        Drag the card, or use ← / → arrows
      </p>
    </div>
  );
}
