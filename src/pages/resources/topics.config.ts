/**
 * Topic hubs surfaced on /resources. Each topic composes existing data:
 * CMS guides (cms_pages where parent_slug = cmsParentSlug), venues tagged with
 * any tag in tagCluster, and news filtered by the same cluster.
 *
 * Static for v1. Promote to a CMS table only if topics start to churn.
 */

import {
  Heart,
  Stethoscope,
  Plane,
  Scale,
  Brain,
  Users,
  Megaphone,
  HeartHandshake,
  type LucideIcon,
} from 'lucide-react';

export interface TopicHub {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tagCluster: string[];
  cmsParentSlug: string;
  adult?: boolean;
}

export const TOPIC_HUBS: TopicHub[] = [
  {
    slug: 'coming-out',
    title: 'Coming out',
    description: 'Telling family, friends, colleagues. Scripts, timing, safety.',
    icon: Heart,
    tagCluster: ['Coming Out', 'Questioning', 'Identity', 'Family'],
    cmsParentSlug: 'guides/coming-out',
  },
  {
    slug: 'trans-health',
    title: 'Trans health',
    description: 'HRT, gender-affirming care, providers, navigating systems.',
    icon: Stethoscope,
    tagCluster: ['Transgender', 'HRT', 'Gender-affirming Care', 'Trans Health'],
    cmsParentSlug: 'guides/trans-health',
  },
  {
    slug: 'travel-safety',
    title: 'Travel safety',
    description: 'Country safety, border crossings, visas, what to pack.',
    icon: Plane,
    tagCluster: ['Travel Safety', 'Travel', 'Border Crossing', 'Visa'],
    cmsParentSlug: 'guides/travel-safety',
  },
  {
    slug: 'legal-rights',
    title: 'Legal rights',
    description: 'Marriage, adoption, discrimination, name & gender changes.',
    icon: Scale,
    tagCluster: ['Legal Rights', 'Marriage Equality', 'Adoption', 'Discrimination'],
    cmsParentSlug: 'guides/legal-rights',
  },
  {
    slug: 'mental-health',
    title: 'Mental health',
    description: 'Therapy, peer support, minority stress, finding help.',
    icon: Brain,
    tagCluster: ['Mental Health', 'Therapy', 'Minority Stress', 'Suicide Prevention'],
    cmsParentSlug: 'guides/mental-health',
  },
  {
    slug: 'family-relationships',
    title: 'Family & relationships',
    description: 'Parents, partners, kids, chosen family, conflict.',
    icon: Users,
    tagCluster: ['Family', 'Relationships', 'Parenting', 'Chosen Family'],
    cmsParentSlug: 'guides/family-relationships',
  },
  {
    slug: 'activism',
    title: 'Activism',
    description: 'Organising, protesting safely, NGOs, history.',
    icon: Megaphone,
    tagCluster: ['Activism', 'Pride', 'Rights & Activism', 'NGO'],
    cmsParentSlug: 'guides/activism',
  },
  {
    slug: 'sex-relationships',
    title: 'Sex & relationships',
    description: 'Safer sex, sexual health, consent, kink basics.',
    icon: HeartHandshake,
    tagCluster: ['Sexual Health', 'Safer Sex', 'Consent', 'PrEP'],
    cmsParentSlug: 'guides/sex',
    adult: true,
  },
];

export function getTopic(slug: string): TopicHub | undefined {
  return TOPIC_HUBS.find((t) => t.slug === slug);
}

/** Tag names treated as "support organisation" markers on venues. */
export const SUPPORT_ORG_TAGS = [
  'Support Organization',
  'Support Organisation',
  'Community Center',
  'Community Centre',
  'NGO',
  'Legal Aid',
  'Health Clinic',
  'LGBTQ+ Center',
];
