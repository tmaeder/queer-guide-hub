import { Star, ThumbsUp, Sparkles, CircleDashed, X, Ban } from 'lucide-react';
import type { KinkRatingValue, KinkSide } from '@/lib/kinks/types';

export const RATING_META: {
  value: KinkRatingValue;
  label: string;
  icon: typeof Star;
}[] = [
  { value: 'favorite', label: 'Favorite', icon: Star },
  { value: 'like', label: 'Like', icon: ThumbsUp },
  { value: 'curious', label: 'Curious', icon: Sparkles },
  { value: 'maybe', label: 'Maybe', icon: CircleDashed },
  { value: 'no', label: 'No', icon: X },
  { value: 'hard_limit', label: 'Hard limit', icon: Ban },
];

export const SIDE_LABEL: Record<KinkSide, string> = {
  general: '',
  giving: 'Giving',
  receiving: 'Receiving',
  self: 'On me',
  partner: 'On my partner',
  dominant: 'Dominant',
  submissive: 'Submissive',
};
