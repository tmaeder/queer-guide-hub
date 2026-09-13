import { Bug, Lightbulb, Sparkles, BookOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface FeedbackCategory {
  value: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

// 2026-05-19: chromatic palette retired in favor of monochrome icon + opacity ramp.
// `color` field kept on the contract so consumers don't need refactoring; visual
// differentiation now comes from the icon (Bug / Lightbulb / Sparkles / BookOpen).
export const feedbackCategories: FeedbackCategory[] = [
  { value: 'bug', label: 'Bug', icon: Bug, color: 'hsl(var(--foreground))' },
  { value: 'idea', label: 'Idea', icon: Lightbulb, color: 'hsl(var(--muted-foreground))' },
  {
    value: 'improvement',
    label: 'Improvement',
    icon: Sparkles,
    color: 'hsl(var(--muted-foreground))',
  },
  {
    value: 'content-idea',
    label: 'Content Idea',
    icon: BookOpen,
    color: 'hsl(var(--muted-foreground))',
  },
];

/** Lookup by value — returns the category or a default */
export const feedbackCategoryMap: Record<string, FeedbackCategory> = Object.fromEntries(
  feedbackCategories.map((c) => [c.value, c]),
);
