import {
  Ban,
  Film,
  Flag,
  Gavel,
  HeartPulse,
  Landmark,
  Milestone as MilestoneIcon,
  Scale,
  ShieldAlert,
  Stethoscope,
  Users,
} from '@/components/icons';
import type { LucideIcon } from '@/components/icons';

const CATEGORY_ICON: Record<string, LucideIcon> = {
  'uprising-movement': Flag,
  'law-equality': Scale,
  'law-decriminalization': Gavel,
  'law-criminalization': Ban,
  depathologization: Stethoscope,
  'persecution-destruction': ShieldAlert,
  'culture-media': Film,
  'politics-representation': Landmark,
  'health-aids': HeartPulse,
  'community-institution': Users,
};

/** The icon a milestone category is drawn with; a generic marker otherwise. */
export const milestoneCategoryIcon = (category: string | null | undefined): LucideIcon =>
  (category && CATEGORY_ICON[category]) || MilestoneIcon;
