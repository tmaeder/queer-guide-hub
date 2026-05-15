import * as React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { cn } from '@/lib/utils';

interface TimelineEntry {
  title: string;
  content: React.ReactNode;
}

interface TimelineProps {
  data: TimelineEntry[];
  className?: string;
}

/**
 * Aceternity-style Timeline — sticky vertical timeline with a scroll-fill
 * left rail that progresses as the user scrolls. Each entry has a sticky
 * title on the left and free content on the right.
 */
export function Timeline({ data, className }: TimelineProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => {
      setHeight(ref.current?.getBoundingClientRect().height ?? 0);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 10%', 'end 50%'],
  });
  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  return (
    <div ref={containerRef} className={cn('w-full bg-background font-sans md:px-10', className)}>
      <div ref={ref} className="relative max-w-7xl mx-auto pb-20">
        {data.map((item, i) => (
          <div key={i} className="flex justify-start pt-10 md:pt-32 md:gap-10">
            <div className="sticky flex flex-col md:flex-row z-30 items-center top-32 self-start max-w-xs lg:max-w-sm md:w-full">
              <div className="h-10 absolute left-3 md:left-3 w-10 rounded-full bg-background border border-border flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-foreground" />
              </div>
              <h3 className="hidden md:block text-xl md:pl-20 md:text-3xl font-bold text-muted-foreground">
                {item.title}
              </h3>
            </div>
            <div className="relative pl-20 pr-4 md:pl-4 w-full">
              <h3 className="md:hidden block text-2xl mb-4 text-left font-bold text-muted-foreground">
                {item.title}
              </h3>
              {item.content}
            </div>
          </div>
        ))}
        <div
          style={{ height: height + 'px' }}
          className="absolute md:left-8 left-8 top-0 overflow-hidden w-[2px] bg-border [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)]"
        >
          <motion.div
            style={{
              height: heightTransform,
              opacity: opacityTransform,
            }}
            className="absolute inset-x-0 top-0 w-[2px] bg-gradient-to-t from-foreground via-foreground/60 to-transparent rounded-full"
          />
        </div>
      </div>
    </div>
  );
}
