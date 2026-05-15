import * as React from 'react';
import { motion, useScroll, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface HeroParallaxProduct {
  title: string;
  link: string;
  thumbnail: string;
}

interface HeroParallaxProps {
  products: HeroParallaxProduct[];
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}

/**
 * Aceternity-style HeroParallax — three rows of cards scrolling in opposing
 * directions with parallax, rotation, and depth as the user scrolls past
 * the hero. Strictly monochrome chrome.
 */
export function HeroParallax({ products, title, subtitle, className }: HeroParallaxProps) {
  const firstRow = products.slice(0, 5);
  const secondRow = products.slice(5, 10);
  const thirdRow = products.slice(10, 15);
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const spring = { stiffness: 300, damping: 30, bounce: 100 };
  const translateX = useSpring(useTransform(scrollYProgress, [0, 1], [0, 1000]), spring);
  const translateXReverse = useSpring(useTransform(scrollYProgress, [0, 1], [0, -1000]), spring);
  const rotateX = useSpring(useTransform(scrollYProgress, [0, 0.2], [15, 0]), spring);
  const opacity = useSpring(useTransform(scrollYProgress, [0, 0.2], [0.2, 1]), spring);
  const rotateZ = useSpring(useTransform(scrollYProgress, [0, 0.2], [20, 0]), spring);
  const translateY = useSpring(useTransform(scrollYProgress, [0, 0.2], [-700, 500]), spring);

  if (reduced) {
    return (
      <section className={cn('py-20', className)}>
        <div className="max-w-7xl mx-auto px-4">
          {(title || subtitle) && (
            <header className="mb-8">
              {title && <h2 className="text-3xl md:text-5xl font-bold tracking-tight">{title}</h2>}
              {subtitle && <p className="mt-4 text-muted-foreground max-w-2xl">{subtitle}</p>}
            </header>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {products.slice(0, 10).map((p) => (
              <Card key={p.link} product={p} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        'h-[230vh] py-20 overflow-hidden antialiased relative flex flex-col self-auto [perspective:1000px] [transform-style:preserve-3d]',
        className,
      )}
    >
      <header className="max-w-7xl relative mx-auto py-12 md:py-20 px-4 w-full left-0 top-0">
        {title && <h2 className="text-2xl md:text-5xl font-bold tracking-tight">{title}</h2>}
        {subtitle && (
          <p className="max-w-2xl text-base md:text-xl mt-4 text-muted-foreground">{subtitle}</p>
        )}
      </header>
      <motion.div
        style={{ rotateX, rotateZ, translateY, opacity }}
      >
        <motion.div className="flex flex-row-reverse space-x-reverse space-x-12 mb-12">
          {firstRow.map((product, i) => (
            <Card key={product.title + i} product={product} translate={translateX} />
          ))}
        </motion.div>
        <motion.div className="flex flex-row mb-12 space-x-12">
          {secondRow.map((product, i) => (
            <Card key={product.title + 'r2-' + i} product={product} translate={translateXReverse} />
          ))}
        </motion.div>
        <motion.div className="flex flex-row-reverse space-x-reverse space-x-12">
          {thirdRow.map((product, i) => (
            <Card key={product.title + 'r3-' + i} product={product} translate={translateX} />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}

function Card({
  product,
  translate,
}: {
  product: HeroParallaxProduct;
  translate?: ReturnType<typeof useSpring>;
}) {
  return (
    <motion.div
      style={translate ? { x: translate } : undefined}
      whileHover={{ y: -20 }}
      className="group/product h-72 w-[24rem] relative shrink-0 rounded-xl overflow-hidden"
    >
      <a href={product.link} className="block">
        <img
          src={product.thumbnail}
          alt={product.title}
          className="object-cover object-left-top absolute h-full w-full inset-0"
        />
      </a>
      <div className="absolute inset-0 h-full w-full opacity-0 group-hover/product:opacity-80 bg-foreground pointer-events-none transition-opacity duration-300" />
      <h2 className="absolute bottom-4 left-4 opacity-0 group-hover/product:opacity-100 text-background text-base font-semibold tracking-tight transition-opacity duration-300">
        {product.title}
      </h2>
    </motion.div>
  );
}
