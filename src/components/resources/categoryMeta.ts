import {
  Tag,
  Heart,
  Flame,
  HeartHandshake,
  Stethoscope,
  ShieldCheck,
  Users,
  BookOpen,
  Scale,
  MapPin,
  LifeBuoy,
  User,
  Venus,
  Sparkles,
  Circle,
  HelpCircle,
  Crown,
  Drama,
  Hand,
  Shirt,
  PersonStanding,
  Infinity as InfinityIcon,
  Calendar as CalendarIcon,
  Home,
  UsersRound,
  Activity,
  Brain,
  Leaf,
  Pill,
  Hospital,
  Handshake,
  Shield,
  Lock,
  AlertTriangle,
  MessageCircle,
  Film,
  Palette,
  PartyPopper,
  Globe2,
  Landmark,
  Star,
  Map as MapIcon,
  Flag,
  Gavel,
  Megaphone,
  Briefcase,
  Building2,
  Plane,
  Bed,
  Phone,
  HandHelping,
  Newspaper,
  type LucideIcon,
} from 'lucide-react';

type CategoryInfo = { short: string; icon: LucideIcon };

// Taxonomy v2 — 10 parents × ~5 children. Matches slugs seeded in migration
// 20260411160000_resources_taxonomy_v2.sql.
const categoryMeta: Record<string, CategoryInfo> = {
  // Parents
  'Identity & Expression': { short: 'Identity', icon: Heart },
  'Sexuality & Kink': { short: 'Sex & Kink', icon: Flame },
  'Relationships & Connection': { short: 'Relationships', icon: HeartHandshake },
  'Health & Wellness': { short: 'Health', icon: Stethoscope },
  'Safety & Practices': { short: 'Safety', icon: ShieldCheck },
  'Community & Culture': { short: 'Community', icon: Users },
  'History & Heritage': { short: 'History', icon: BookOpen },
  'Rights & Activism': { short: 'Rights', icon: Scale },
  'Places & Travel': { short: 'Places', icon: MapPin },
  'Support & News': { short: 'Support', icon: LifeBuoy },

  // Identity & Expression
  'Sexual Orientation': { short: 'Orientation', icon: Heart },
  'Gender Identity': { short: 'Gender', icon: Venus },
  'Expression & Presentation': { short: 'Expression', icon: Sparkles },
  'Intersex & Bodies': { short: 'Intersex', icon: Circle },
  'Questioning & Labels': { short: 'Questioning', icon: HelpCircle },

  // Sexuality & Kink
  'Sexual Roles': { short: 'Roles', icon: User },
  'BDSM & Power Exchange': { short: 'BDSM', icon: Crown },
  'Fetishes & Interests': { short: 'Fetishes', icon: Flame },
  'Practices & Play': { short: 'Play', icon: Hand },
  'Gear & Aesthetics': { short: 'Gear', icon: Shirt },
  'Body Types & Archetypes': { short: 'Archetypes', icon: PersonStanding },

  // Relationships & Connection
  'Relationship Structures': { short: 'Structures', icon: InfinityIcon },
  'Dating & Courtship': { short: 'Dating', icon: CalendarIcon },
  'Family & Chosen Family': { short: 'Family', icon: Home },
  'Friendship & Community': { short: 'Friendship', icon: UsersRound },

  // Health & Wellness
  'Sexual Health': { short: 'Sexual', icon: Activity },
  'Mental Health': { short: 'Mental', icon: Brain },
  'Physical & Reproductive': { short: 'Physical', icon: Leaf },
  'Substances & Harm Reduction': { short: 'Substances', icon: Pill },
  'Care Access': { short: 'Care', icon: Hospital },

  // Safety & Practices
  'Consent & Negotiation': { short: 'Consent', icon: Handshake },
  'Safer Sex': { short: 'Safer Sex', icon: Shield },
  'Physical & Digital Safety': { short: 'Safety', icon: Lock },
  'Risk-Aware Play': { short: 'RACK', icon: AlertTriangle },

  // Community & Culture
  'Slang & Terminology': { short: 'Slang', icon: MessageCircle },
  'Media, Film & Music': { short: 'Media', icon: Film },
  'Art, Literature & Zines': { short: 'Art', icon: Palette },
  'Events & Scene': { short: 'Events', icon: PartyPopper },
  Subcultures: { short: 'Scenes', icon: Globe2 },

  // History & Heritage
  'Movements & Milestones': { short: 'Movements', icon: Landmark },
  'Figures & Icons': { short: 'Figures', icon: Star },
  'Queer History by Region': { short: 'Regional', icon: MapIcon },
  'Symbols & Flags': { short: 'Symbols', icon: Flag },

  // Rights & Activism
  'Legal Rights': { short: 'Legal', icon: Gavel },
  'Political Activism': { short: 'Activism', icon: Megaphone },
  'Workplace, Education & Policy': { short: 'Workplace', icon: Briefcase },
  'Global & Regional Rights': { short: 'Global', icon: Globe2 },

  // Places & Travel
  'Venues & Nightlife': { short: 'Venues', icon: Building2 },
  'Travel & Destinations': { short: 'Travel', icon: Plane },
  'Safe Spaces': { short: 'Safe', icon: ShieldCheck },
  Accommodation: { short: 'Stays', icon: Bed },

  // Support & News
  'Helplines & Hotlines': { short: 'Helplines', icon: Phone },
  'Support Services & NGOs': { short: 'Services', icon: HandHelping },
  'Current Affairs': { short: 'News', icon: Newspaper },
  'Professions & Allies': { short: 'Professions', icon: Drama },
};

// Stable display order for parents — used by Overview and the filter bar.
export const parentOrder: string[] = [
  'Identity & Expression',
  'Sexuality & Kink',
  'Relationships & Connection',
  'Health & Wellness',
  'Safety & Practices',
  'Community & Culture',
  'History & Heritage',
  'Rights & Activism',
  'Places & Travel',
  'Support & News',
];

/**
 * P2-1 — single source of truth for the adult-content category list.
 * Both the parent "Sexuality & Kink" and every leaf under it are gated
 * behind the age affirmation modal + Safe mode in SafeModeProvider.
 *
 * These are v2 taxonomy names, held in `tag_categories` and reached through
 * `tag_category_assignments`. That is the right axis for the age gate and the
 * noindex rule, which both read `selectedTag.categories`.
 *
 * It is the WRONG axis anywhere the category arrives as `unified_tags.category`
 * — the legacy free-text column, whose values ('Kink & Fetish', 'Power
 * Exchange', 'BDSM', 'Fetish Practices', …) appear in none of these names, and
 * which is NULL entirely for a third of active tags. Prefer `isAdultTag()`
 * below, which trusts the `is_adult` flag first.
 */
export const ADULT_CATEGORY_NAMES: ReadonlySet<string> = new Set([
  'Sexuality & Kink',
  'Sexual Roles',
  'BDSM & Power Exchange',
  'Fetishes & Interests',
  'Practices & Play',
  'Gear & Aesthetics',
  'Body Types & Archetypes',
]);

export function isAdultCategoryName(name: string | null | undefined): boolean {
  return !!name && ADULT_CATEGORY_NAMES.has(name);
}

/**
 * Whether a tag is adult content, for Safe mode filtering.
 *
 * `unified_tags.is_adult` is the real axis and is checked first; the category
 * name is kept as a fallback so a tag that is categorised but not yet flagged
 * still gets hidden. Erring toward hiding is deliberate — under-moderation is
 * the worse failure here.
 */
export function isAdultTag(tag: { is_adult?: boolean | null; category?: string | null }): boolean {
  return tag.is_adult === true || isAdultCategoryName(tag.category);
}

export function getCategoryIcon(category: string): LucideIcon {
  return categoryMeta[category]?.icon || Tag;
}

export function getCategoryShortName(category: string): string {
  return categoryMeta[category]?.short || category;
}
