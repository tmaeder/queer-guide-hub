import {
  Tag, Heart, Brain, Calendar, Briefcase, TrendingUp,
  Shield, MessageCircle, Pill, Scale, Sparkles, BookOpen,
  Flame, Handshake, Zap, Users, type LucideIcon,
} from "lucide-react";

const categoryMeta: Record<string, { short: string; icon: LucideIcon }> = {
  // Parent categories
  'Identity & Orientation': { short: 'Identity', icon: Heart },
  'Kink & Fetish': { short: 'Kink & Fetish', icon: Flame },
  'Roles & Dynamics': { short: 'Roles', icon: Shield },
  'Health & Wellness': { short: 'Health', icon: Brain },
  'Substances & Harm Reduction': { short: 'Harm Reduction', icon: Pill },
  'Rights & Activism': { short: 'Activism', icon: Scale },
  'Relationships': { short: 'Relationships', icon: Heart },
  'Community & Events': { short: 'Community', icon: Calendar },
  'Culture & Slang': { short: 'Culture', icon: MessageCircle },
  'Venue & Travel': { short: 'Venues', icon: Briefcase },
  'News Topics': { short: 'News', icon: TrendingUp },
  'Safety & Practices': { short: 'Safety', icon: Shield },
  'Support & Resources': { short: 'Support', icon: Handshake },
  'Miscellaneous': { short: 'Other', icon: Tag },
  // Subcategories
  'Sexual Orientation': { short: 'Orientation', icon: Heart },
  'Gender Identity': { short: 'Gender', icon: Users },
  'Expression & Presentation': { short: 'Expression', icon: Sparkles },
  'Intersex': { short: 'Intersex', icon: Heart },
  'BDSM': { short: 'BDSM', icon: Flame },
  'Leather & Gear': { short: 'Leather & Gear', icon: Shield },
  'Fetish Practices': { short: 'Fetish', icon: Flame },
  'Body Modification': { short: 'Body Mod', icon: Zap },
  'Power Exchange': { short: 'Power Exchange', icon: Shield },
  'Relationship Roles': { short: 'Rel. Roles', icon: Users },
  'Sexual Roles': { short: 'Sexual Roles', icon: Shield },
  'Sexual Health': { short: 'Sexual Health', icon: Brain },
  'Mental Health': { short: 'Mental Health', icon: Brain },
  'Physical Wellness': { short: 'Physical', icon: Brain },
  'Reproductive Health': { short: 'Reproductive', icon: Brain },
  'Legal Rights': { short: 'Legal', icon: Scale },
  'Political Activism': { short: 'Political', icon: Scale },
  'Historical Movements': { short: 'Historical', icon: BookOpen },
  'Workplace & Education': { short: 'Workplace', icon: Briefcase },
  'Slang & Terminology': { short: 'Slang', icon: MessageCircle },
  'Media & Entertainment': { short: 'Media', icon: MessageCircle },
  'Art & Literature': { short: 'Art', icon: BookOpen },
  'History & Heritage': { short: 'Heritage', icon: BookOpen },
};

export function getCategoryIcon(category: string): LucideIcon {
  return categoryMeta[category]?.icon || Tag;
}

export function getCategoryShortName(category: string): string {
  return categoryMeta[category]?.short || category;
}
