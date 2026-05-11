import React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

interface ParallaxProps {
  children: React.ReactNode;
  speed?: number;
  axis?: 'y' | 'x';
  className?: string;
}

/**
 * Scroll-linked parallax transform. Wrap around an image or hero layer.
 */
export const Parallax = ({
  children,
  speed = 0.3,
  axis = 'y',
  className,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const distance = 100 * speed;
  const translate = useTransform(scrollYProgress, [0, 1], [-distance, distance]);

  const style = axis === 'y' ? { y: translate } : { x: translate };

  return (
    <motion.div ref={ref} className={className} style={style}>
      {children}
    </motion.div>
  );
};

export default Parallax;
