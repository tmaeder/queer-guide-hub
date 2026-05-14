import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/motion';

interface TextGenerateEffectProps {
  words: string;
  className?: string;
  style?: React.CSSProperties;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  staggerDelay?: number;
  blur?: boolean;
}

export function TextGenerateEffect({
  words,
  className,
  style,
  as: Tag = 'h1',
  staggerDelay = 0.05,
  blur = true,
}: TextGenerateEffectProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const wordArray = words.split(' ');

  if (reduced) {
    return <Tag className={className} style={style}>{words}</Tag>;
  }

  return (
    <Tag ref={ref as React.Ref<HTMLHeadingElement>} className={cn('inline', className)} style={style}>
      {wordArray.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="inline-block"
          initial={{ opacity: 0, filter: blur ? 'blur(8px)' : 'none', y: 4 }}
          animate={
            inView
              ? { opacity: 1, filter: 'blur(0px)', y: 0 }
              : { opacity: 0, filter: blur ? 'blur(8px)' : 'none', y: 4 }
          }
          transition={{
            ...springs.snappy,
            delay: i * staggerDelay,
          }}
        >
          {word}
          {i < wordArray.length - 1 && ' '}
        </motion.span>
      ))}
    </Tag>
  );
}
