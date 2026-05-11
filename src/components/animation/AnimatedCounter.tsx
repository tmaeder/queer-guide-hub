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
  const mv = useMotionValue(0);
  const [display, setDisplay] = React.useState(0);

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
    const controls = animate(mv, value, {
      duration: dur,
      ease: easing.smooth,
    });
    return () => controls.stop();
  }, [inView, value, dur, reduced, mv]);

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
