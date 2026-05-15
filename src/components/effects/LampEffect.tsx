import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface LampEffectProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Aceternity-style Lamp — two converging conic gradient beams form an
 * inverted-triangle "lamp" focal area. Monochrome, breathing intensity.
 */
export function LampEffect({ className, children }: LampEffectProps) {
  const reduced = useReducedMotion();
  return (
    <div
      className={cn(
        'relative flex w-full flex-col items-center justify-center overflow-hidden bg-background',
        className,
      )}
    >
      <div className="relative isolate z-0 flex w-full flex-1 scale-y-125 items-center justify-center">
        <motion.div
          initial={reduced ? false : { opacity: 0.5, width: '15rem' }}
          whileInView={reduced ? undefined : { opacity: 1, width: '30rem' }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{
            backgroundImage: 'conic-gradient(var(--conic-position), var(--tw-gradient-stops))',
            ['--conic-position' as string]: 'from 70deg at center top',
          }}
          className="absolute inset-auto right-1/2 h-56 overflow-visible w-[30rem] from-foreground/40 via-transparent to-transparent text-foreground [--tw-gradient-stops:var(--from),var(--via),var(--to)] [--from:hsl(var(--foreground)/0.4)] [--via:transparent] [--to:transparent]"
        >
          <div className="absolute w-[100%] left-0 bg-background h-40 bottom-0 z-20 [mask-image:linear-gradient(to_top,white,transparent)]" />
          <div className="absolute w-40 h-[100%] left-0 bg-background bottom-0 z-20 [mask-image:linear-gradient(to_right,white,transparent)]" />
        </motion.div>
        <motion.div
          initial={reduced ? false : { opacity: 0.5, width: '15rem' }}
          whileInView={reduced ? undefined : { opacity: 1, width: '30rem' }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{
            backgroundImage: 'conic-gradient(var(--conic-position), var(--tw-gradient-stops))',
            ['--conic-position' as string]: 'from 290deg at center top',
          }}
          className="absolute inset-auto left-1/2 h-56 w-[30rem] from-transparent via-transparent to-foreground/40 text-foreground [--tw-gradient-stops:var(--from),var(--via),var(--to)] [--from:transparent] [--via:transparent] [--to:hsl(var(--foreground)/0.4)]"
        >
          <div className="absolute w-40 h-[100%] right-0 bg-background bottom-0 z-20 [mask-image:linear-gradient(to_left,white,transparent)]" />
          <div className="absolute w-[100%] right-0 bg-background h-40 bottom-0 z-20 [mask-image:linear-gradient(to_top,white,transparent)]" />
        </motion.div>
        <div className="absolute top-1/2 h-48 w-full translate-y-12 scale-x-150 bg-background blur-2xl" />
        <div className="absolute top-1/2 z-50 h-48 w-full bg-transparent backdrop-blur-md" />
        <div className="absolute inset-auto z-50 h-36 w-[28rem] -translate-y-1/2 rounded-full bg-foreground/20 opacity-50 blur-3xl" />
        <motion.div
          initial={reduced ? false : { width: '8rem' }}
          whileInView={reduced ? undefined : { width: '16rem' }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-auto z-30 h-36 w-64 -translate-y-[6rem] rounded-full bg-foreground/30 blur-2xl"
        />
        <motion.div
          initial={reduced ? false : { width: '15rem' }}
          whileInView={reduced ? undefined : { width: '30rem' }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-auto z-50 h-0.5 w-[30rem] -translate-y-[7rem] bg-foreground"
        />
        <div className="absolute inset-auto z-40 h-44 w-full -translate-y-[12.5rem] bg-background" />
      </div>
      <div className="relative z-50 flex -translate-y-32 flex-col items-center px-5">{children}</div>
    </div>
  );
}
