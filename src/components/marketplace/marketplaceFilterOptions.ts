import {
  Accessibility,
  Flag,
  Globe,
  HandHeart,
  Rainbow,
  Users,
  type LucideIcon,
} from '@/components/icons';

export const COMMUNITY_OWNED_OPTIONS: Array<{ value: string; label: string; icon: LucideIcon }> = [
  { value: 'queer_owned', label: 'Queer-owned', icon: Rainbow },
  { value: 'trans_owned', label: 'Trans-owned', icon: Flag },
  { value: 'bipoc_owned', label: 'BIPOC-owned', icon: Globe },
  { value: 'women_owned', label: 'Women-owned', icon: Users },
  { value: 'disabled_owned', label: 'Disabled-owned', icon: Accessibility },
  { value: 'nonprofit', label: 'Non-profit', icon: HandHeart },
];
