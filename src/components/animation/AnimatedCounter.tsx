import React from 'react';
import {
  motion,
  useInView,
  useMotionValue,
  animate,
  useReducedMotion,
} from 'motion/react';
import { easing, fadeIn } from '@/lib/motion';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  locale?: string;
  className?: string;
  suffix?: string;
  prefix?: string;
}

export const AnimatedCounter = ({
  value,
  duration: dur = 1.5,
  locale = 'en',
  className,
  suffix = '',
  prefix = '',
}: AnimatedCounterProps) => {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  const reduced = useReducedMotion();
  // D12: start the motion value + display at the target so first paint
  // never reads "0+ VENUES" before useInView fires. Animation (when it
  // runs) eases from a partial value up to the target, so there's still
  // a count-up feel but the misleading zero is gone.
  const start = Math.max(0, Math.floor(value * 0.7));
  const mv = useMotionValue(value);
  const [display, setDisplay] = React.useState(value);

  React.useEffect(() => {
    const unsub = mv.on('change', (v) => setDisplay(Math.round(v)));
    return unsub;
  }, [mv]);

  React.useEffect(() => {
    if (!inView) return;
    if (reduced) {
      mv.set(value);
      return;
    }
    mv.set(start);
    const controls = animate(mv, value, {
      duration: dur,
      ease: easing.smooth,
    });
    return () => controls.stop();
  }, [inView, value, dur, reduced, mv, start]);

  return (
    <motion.span
      ref={ref}
      className={className}
      variants={fadeIn}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
    >
      {prefix}
      {display.toLocaleString(locale)}
      {suffix}
    </motion.span>
  );
};
