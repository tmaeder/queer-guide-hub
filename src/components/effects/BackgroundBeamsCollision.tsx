import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface Beam {
  initialX: number;
  translateX: number;
  duration: number;
  repeatDelay: number;
  delay: number;
  className?: string;
}

const BEAMS: Beam[] = [
  { initialX: 10, translateX: 10, duration: 7, repeatDelay: 3, delay: 2 },
  { initialX: 600, translateX: 600, duration: 3, repeatDelay: 3, delay: 4 },
  { initialX: 100, translateX: 100, duration: 7, repeatDelay: 7, className: 'h-6' },
  { initialX: 400, translateX: 400, duration: 5, repeatDelay: 14, delay: 4 },
  { initialX: 800, translateX: 800, duration: 11, repeatDelay: 2, className: 'h-20' },
  { initialX: 1000, translateX: 1000, duration: 4, repeatDelay: 2, className: 'h-12' },
  { initialX: 1200, translateX: 1200, duration: 6, repeatDelay: 4, delay: 2, className: 'h-6' },
];

/**
 * Aceternity-style BackgroundBeamsCollision — vertical beams stream down,
 * collide with the floor, and emit short-lived particle bursts. Monochrome.
 */
export function BackgroundBeamsCollision({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const parentRef = React.useRef<HTMLDivElement>(null);

  return (
    <div
      ref={parentRef}
      className={cn(
        'relative flex items-center w-full justify-center overflow-hidden',
        className,
      )}
    >
      {BEAMS.map((beam, i) => (
        <CollisionMechanism
          key={i + beam.className}
          beamOptions={beam}
          containerRef={containerRef}
          parentRef={parentRef}
        />
      ))}

      {children}

      <div
        ref={containerRef}
        className="absolute bottom-0 bg-foreground/10 w-full inset-x-0 pointer-events-none"
        style={{ boxShadow: '0 -10px 30px rgba(0,0,0,0.10)' }}
      />
    </div>
  );
}

const CollisionMechanism = React.forwardRef<
  HTMLDivElement,
  {
    containerRef: React.RefObject<HTMLDivElement | null>;
    parentRef: React.RefObject<HTMLDivElement | null>;
    beamOptions: Beam;
  }
>(({ parentRef, containerRef, beamOptions }, _ref) => {
  const beamRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [collision, setCollision] = React.useState<{ detected: boolean; coordinates: { x: number; y: number } | null }>({
    detected: false,
    coordinates: null,
  });
  const [beamKey, setBeamKey] = React.useState(0);
  const [cycleStarted, setCycleStarted] = React.useState(false);

  React.useEffect(() => {
    if (reduced) return;
    const checkCollision = () => {
      if (beamRef.current && containerRef.current && parentRef.current && !cycleStarted) {
        const beamRect = beamRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const parentRect = parentRef.current.getBoundingClientRect();
        if (beamRect.bottom >= containerRect.top) {
          const relX = beamRect.left - parentRect.left + beamRect.width / 2;
          const relY = beamRect.bottom - parentRect.top;
          setCollision({ detected: true, coordinates: { x: relX, y: relY } });
          setCycleStarted(true);
        }
      }
    };
    const id = setInterval(checkCollision, 50);
    return () => clearInterval(id);
  }, [cycleStarted, parentRef, containerRef, reduced]);

  React.useEffect(() => {
    if (collision.detected && collision.coordinates) {
      const t1 = setTimeout(() => setCollision({ detected: false, coordinates: null }), 2000);
      const t2 = setTimeout(() => {
        setBeamKey((k) => k + 1);
        setCycleStarted(false);
      }, 2000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [collision]);

  if (reduced) return null;

  return (
    <>
      <motion.div
        key={beamKey}
        ref={beamRef}
        animate="animate"
        initial={{ translateY: '-200px', translateX: `${beamOptions.initialX || 0}px`, rotate: 0 }}
        variants={{
          animate: {
            translateY: '1800px',
            translateX: `${beamOptions.translateX || 0}px`,
            rotate: 0,
          },
        }}
        transition={{
          duration: beamOptions.duration || 8,
          repeat: Infinity,
          repeatType: 'loop',
          ease: 'linear',
          delay: beamOptions.delay || 0,
          repeatDelay: beamOptions.repeatDelay || 0,
        }}
        className={cn(
          'absolute left-0 top-20 m-auto h-14 w-px rounded-full bg-gradient-to-t from-foreground via-foreground/70 to-transparent',
          beamOptions.className,
        )}
      />
      <AnimatePresence>
        {collision.detected && collision.coordinates && (
          <Explosion key={`${collision.coordinates.x}-${collision.coordinates.y}`} style={{ left: collision.coordinates.x, top: collision.coordinates.y }} />
        )}
      </AnimatePresence>
    </>
  );
});
CollisionMechanism.displayName = 'CollisionMechanism';

function Explosion({ style }: { style: React.CSSProperties }) {
  const spans = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    dx: (Math.random() - 0.5) * 70,
    dy: -(Math.random() * 50 + 50),
  }));
  return (
    <div style={style} className="absolute z-50 h-2 w-2 -translate-x-1/2 -translate-y-1/2">
      <motion.div
        initial={{ opacity: 0.7, scale: 0 }}
        animate={{ opacity: 1, scale: 1.5 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
        className="absolute -inset-x-10 top-0 m-auto h-2 w-10 rounded-full bg-gradient-to-r from-transparent via-foreground to-transparent blur-sm"
      />
      {spans.map((s) => (
        <motion.span
          key={s.id}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: s.dx, y: s.dy, opacity: 0 }}
          transition={{ duration: Math.random() * 1.2 + 0.6, ease: 'easeOut' }}
          className="absolute h-1 w-1 rounded-full bg-foreground"
        />
      ))}
    </div>
  );
}
