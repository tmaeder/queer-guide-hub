import { Bug, Lightbulb, Sparkles, BookOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface FeedbackCategory {
  value: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

export const feedbackCategories: FeedbackCategory[] = [
  { value: 'bug', label: 'Bug', icon: Bug, color: '#ef4444' },
  { value: 'idea', label: 'Idea', icon: Lightbulb, color: '#f59e0b' },
  { value: 'improvement', label: 'Improvement', icon: Sparkles, color: '#8b5cf6' },
  { value: 'content-idea', label: 'Content Idea', icon: BookOpen, color: '#0ea5e9' },
];

/** Lookup by value — returns the category or a default */
export const feedbackCategoryMap: Record<string, FeedbackCategory> = Object.fromEntries(
  feedbackCategories.map((c) => [c.value, c]),
);
