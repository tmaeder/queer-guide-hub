import {
  Clock,
  FlaskConical,
  Hand,
  HeartPulse,
  Pill,
  Shield,
  ShieldCheck,
  Syringe,
} from '@/components/icons';

/** One mark per protection method (slugs from `sti_protection_methods`). */
export const PROTECTION_ICONS: Record<string, typeof Shield> = {
  'condom-use': ShieldCheck,
  'gloves-hygiene': Hand,
  'no-needle-sharing': Syringe,
  pep: Clock,
  prep: Pill,
  'testing-treatment': FlaskConical,
  'u-equals-u': HeartPulse,
  vaccination: Syringe,
};

export const protectionIcon = (slug: string) => PROTECTION_ICONS[slug] ?? Shield;
