import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Custom font-size tokens defined in src/index.css @theme. Without this
// extension, tailwind-merge treats `text-13` and `text-background` as both
// belonging to the generic `text-*` group and silently drops one — e.g.
// `text-13 text-background` collapses to `text-13`, making text invisible
// against `bg-foreground` in dark mode.
const customTextSizes = [
  "hero-xl",
  "hero",
  "display",
  "headline-lg",
  "headline",
  "title",
  "body-lg",
  "15",
  "13",
  "xs2",
  "2xs",
  "3xs",
]

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: customTextSizes }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
