import * as React from 'react';
import { cn } from '@/lib/utils';
import type { EntitySpan } from './EntityCard';

type Preset = 'featured' | 'mosaic' | 'uniform';

interface BentoSectionProps {
  preset?: Preset;
  className?: string;
  children: React.ReactNode;
}

// Featured: first item wide+tall, rest uniform thirds
const FEATURED_PATTERN: EntitySpan[] = ['wide', 'md', 'md', 'sm', 'sm', 'sm', 'sm'];
// Mosaic: alternating wide / thirds for visual rhythm
const MOSAIC_PATTERN: EntitySpan[] = ['lg', 'md', 'sm', 'sm', 'sm', 'md', 'lg', 'sm', 'sm', 'sm'];

export function spansForPreset(preset: Preset, index: number, _total: number): EntitySpan {
  if (preset === 'uniform') return 'sm';
  const pattern = preset === 'featured' ? FEATURED_PATTERN : MOSAIC_PATTERN;
  // Only pattern the first window; remainder defaults to sm
  if (index < pattern.length) return pattern[index];
  return 'sm';
}

export function BentoSection({ preset = 'mosaic', className, children }: BentoSectionProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-12 gap-3 md:gap-4 auto-rows-[minmax(0,auto)]',
        className,
      )}
      data-bento-preset={preset}
    >
      {children}
    </div>
  );
}
