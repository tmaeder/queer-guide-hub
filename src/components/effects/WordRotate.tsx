import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface WordRotateProps {
  words: string[];
  interval?: number;
  className?: string;
}

/**
 * Aceternity-style flipping words — vertical rotate-in/out of a list of words.
 * Pairs nicely with a static prefix headline (e.g. "Find your X").
 */
export function WordRotate({ words, interval = 2400, className }: WordRotateProps) {
  const [i, setI] = React.useState(0);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (reduced || words.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [interval, words.length, reduced]);

  return (
    <span className={cn('inline-flex relative overflow-hidden align-baseline', className)}>
      <AnimatePresence mode="wait">
        <motion.span
          key={words[i]}
          initial={reduced ? false : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? undefined : { y: '-100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          className="inline-block whitespace-nowrap"
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
