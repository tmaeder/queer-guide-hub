import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Custom font-size tokens defined in src/index.css @theme. Without this
// extension, tailwind-merge treats `text-13` and `text-background` as both
// belonging to the generic `text-*` group and silently drops one — e.g.
// `text-13 text-background` collapses to `text-13`, making text invisible
// against `bg-foreground` in dark mode.
const customTextSizes = [
  'hero-xl',
  'hero',
  'display',
  'headline',
  'title',
  'body-lg',
  '15',
  '13',
  'xs2',
  '2xs',
  '3xs',
];

// Custom container tokens defined in src/index.css @theme (--container-page,
// --container-reading, --container-form). tailwind-merge only recognizes
// t-shirt sizes in the `max-w` group, so without this it would treat
// `max-w-page` as an unknown class and let a caller's `max-w-reading` sit
// alongside it instead of replacing it — two caps applying at once, decided by
// stylesheet order rather than by the caller.
const customContainerSizes = ['page', 'reading', 'form'];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: customTextSizes }],
      'max-w': [{ 'max-w': customContainerSizes }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
