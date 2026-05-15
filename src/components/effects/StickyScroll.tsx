import * as React from 'react';
import { motion, useScroll } from 'motion/react';
import { cn } from '@/lib/utils';

export interface StickyScrollItem {
  title: string;
  description: React.ReactNode;
  content: React.ReactNode;
}

interface StickyScrollProps {
  content: StickyScrollItem[];
  className?: string;
}

/**
 * Aceternity-style StickyScroll — left column scrolls through text entries
 * while the right column shows a sticky image/content pane that swaps as
 * the user scrolls past each section. Monochrome.
 */
export function StickyScroll({ content, className }: StickyScrollProps) {
  const [active, setActive] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ container: ref, offset: ['start start', 'end start'] });
  const cardLength = content.length;

  React.useEffect(() => {
    const unsub = scrollYProgress.on('change', (latest) => {
      const breakpoints = content.map((_, i) => i / cardLength);
      const closest = breakpoints.reduce((acc, b, i) => {
        const dist = Math.abs(latest - b);
        return dist < Math.abs(latest - breakpoints[acc]) ? i : acc;
      }, 0);
      setActive(closest);
    });
    return () => unsub();
  }, [scrollYProgress, content, cardLength]);

  return (
    <motion.div
      ref={ref}
      className={cn('h-[30rem] overflow-y-auto flex justify-center relative space-x-10 rounded-container p-10 border border-border/60 bg-background no-scrollbar', className)}
    >
      <div className="relative flex items-start px-4">
        <div className="max-w-2xl">
          {content.map((item, i) => (
            <div key={item.title + i} className="my-20">
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: active === i ? 1 : 0.3 }}
                transition={{ duration: 0.3 }}
                className="text-2xl font-bold tracking-tight text-foreground"
              >
                {item.title}
              </motion.h2>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: active === i ? 1 : 0.3 }}
                transition={{ duration: 0.3 }}
                className="text-base text-muted-foreground max-w-sm mt-4"
              >
                {item.description}
              </motion.div>
            </div>
          ))}
          <div className="h-32" />
        </div>
      </div>
      <div className="hidden lg:block h-60 w-80 rounded-container bg-muted sticky top-10 overflow-hidden ring-1 ring-border/60">
        {content[active]?.content}
      </div>
    </motion.div>
  );
}
