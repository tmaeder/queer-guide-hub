/**
 * The situations /help can help with, beyond a mental-health crisis.
 *
 * Every step here is general, widely published guidance (WHO, national sexual
 * health and harm-reduction services, UNHCR). Nothing is country-specific,
 * because the page serves every country: anything that depends on local law
 * points to the rights pages or a local service instead of asserting it.
 *
 * `topics` are hotline topic slugs from the `help` CMS page; a situation shows
 * the lines tagged with any of them. `external` services are international and
 * were checked by hand; add one only with a URL you have opened.
 */

import {
  Baby,
  HandHeart,
  HeartPulse,
  Pill,
  Plane,
  Scale,
  Shield,
  ShieldAlert,
  Stethoscope,
} from '@/components/icons';

export type SituationId =
  | 'crisis'
  | 'sti'
  | 'pregnancy'
  | 'sexual-assault'
  | 'violence'
  | 'legal'
  | 'asylum'
  | 'trans-health'
  | 'drugs';

export interface Situation {
  id: SituationId;
  label: string;
  hint: string;
  icon: typeof Shield;
  /** The one time-critical fact, shown first. */
  urgent?: string;
  steps: string[];
  topics: string[];
  /** Glossary and site pages with the full explanation. */
  links: { label: string; to: string }[];
  /** International services, opened in a new tab. */
  external: { name: string; href: string; note: string }[];
}

export const SITUATIONS: Situation[] = [
  {
    id: 'crisis',
    label: 'Mental health & crisis',
    hint: 'Talk to someone now',
    icon: HandHeart,
    steps: [],
    topics: ['crisis', 'suicide'],
    links: [],
    external: [],
  },
  {
    id: 'sti',
    label: 'STI & HIV exposure',
    hint: 'PEP, testing, treatment',
    icon: Stethoscope,
    urgent:
      'If you may have been exposed to HIV, PEP has to start within 72 hours — the sooner the better. Go to an emergency department or sexual health clinic now.',
    steps: [
      'Say “I need PEP” at the emergency department or sexual health clinic. It is a 28-day course of pills.',
      'Get tested for HIV and other STIs. Some infections only show up on a test weeks later, so you may be asked to come back.',
      'Most STIs are treatable, and many clinics test for free and anonymously.',
      'Until you have results, use condoms or avoid sex, and tell recent partners if a test comes back positive.',
    ],
    topics: ['hiv', 'health'],
    links: [
      { label: 'PEP', to: '/tags/pep' },
      { label: 'PrEP', to: '/tags/prep' },
      { label: 'Doxy-PEP', to: '/tags/doxy-pep' },
      { label: 'STI testing', to: '/tags/sti-testing' },
      { label: 'U=U', to: '/tags/u-equals-u' },
    ],
    external: [],
  },
  {
    id: 'pregnancy',
    label: 'Unwanted pregnancy',
    hint: 'Emergency contraception, options',
    icon: Baby,
    urgent:
      'Emergency contraception works best the sooner you take it: levonorgestrel pills within 3 days (72 hours), ulipristal pills within 5 days, a copper IUD within 5 days.',
    steps: [
      'Pharmacies sell emergency contraception, often without a prescription. A doctor or sexual health clinic can fit a copper IUD.',
      'Anyone with a uterus can get pregnant, including trans men and non-binary people, also while on testosterone.',
      'If you are already pregnant, a clinic or counselling service can talk through every option without pressure.',
      'Abortion law differs a lot by country. Check before you travel, and use services that tell you what is legal where you are.',
    ],
    topics: ['health', 'women'],
    links: [
      { label: 'Emergency contraception', to: '/tags/emergency-contraception' },
      { label: 'Morning-after pill', to: '/tags/morning-after-pill' },
      { label: 'Pregnancy', to: '/tags/pregnancy' },
    ],
    external: [
      {
        name: 'Women on Web',
        href: 'https://www.womenonweb.org/',
        note: 'Abortion information and telemedicine, many languages',
      },
    ],
  },
  {
    id: 'sexual-assault',
    label: 'Rape & sexual assault',
    hint: 'Medical care, your choices',
    icon: ShieldAlert,
    urgent:
      'If you are in danger, call the emergency number above. Medical care within 72 hours can prevent HIV (PEP) and pregnancy (emergency contraception).',
    steps: [
      'It was not your fault, whatever happened before or during.',
      'You can get medical care without reporting to the police. Reporting is your decision, now or later.',
      'If you might report, evidence is easiest to collect within 72 hours. If you can, avoid washing or changing clothes, and keep what you wore in a paper bag. If you already have, you can still get help.',
      'If you think you were drugged, ask for a urine test as soon as possible.',
      'A specialist sexual violence service can go with you, to the clinic or the police.',
    ],
    topics: ['violence'],
    links: [
      { label: 'Sexual assault', to: '/tags/sexual-assault' },
      { label: 'Spiking', to: '/tags/spiking' },
      { label: 'Consent', to: '/tags/consent' },
    ],
    external: [],
  },
  {
    id: 'violence',
    label: 'Violence & hate crime',
    hint: 'Attacks, threats, abuse at home',
    icon: Shield,
    urgent: 'If you are in danger right now, call the emergency number above.',
    steps: [
      'Get somewhere safe first, and get any injuries seen to.',
      'Write down what happened while you remember it: date, time, place, what was said, who saw it.',
      'Keep evidence: photos of injuries and damage, screenshots of messages, names of witnesses.',
      'You can report to the police, or in many places to an LGBTQ+ group that reports for you anonymously.',
      'If the violence is at home, a domestic-violence service can help you plan how to leave safely.',
    ],
    topics: ['violence', 'discrimination'],
    links: [
      { label: 'Hate crimes', to: '/tags/hate-crimes' },
      { label: 'Intimate partner violence', to: '/tags/intimate-partner-violence' },
      { label: 'Domestic violence', to: '/tags/domestic-violence' },
    ],
    external: [],
  },
  {
    id: 'legal',
    label: 'Legal help',
    hint: 'Discrimination, police, your rights',
    icon: Scale,
    steps: [
      'Check what the law says where you are, and where you are going.',
      'Keep records of anything that happened: letters, emails, dates and names.',
      'Many countries have free legal advice through LGBTQ+ organisations, law clinics or ombuds offices.',
      'If you are arrested, you can usually ask for a lawyer and do not have to explain yourself without one.',
    ],
    topics: ['legal', 'discrimination'],
    links: [{ label: 'Rights by country', to: '/tags/rights-by-country' }],
    external: [],
  },
  {
    id: 'asylum',
    label: 'Asylum & leaving a country',
    hint: 'Persecution, relocation, refuge',
    icon: Plane,
    steps: [
      'Being persecuted for your sexual orientation or gender identity is recognised grounds for asylum under UNHCR guidance.',
      'Claim asylum as early as you can after arriving. Delays can be held against a claim.',
      'Get legal advice before your asylum interview, and tell the truth even when it is hard.',
      'If it is not safe to keep messages or photos on your phone, keep a copy somewhere else.',
    ],
    topics: ['legal'],
    links: [
      { label: 'Asylum', to: '/tags/asylum' },
      { label: 'Rights by country', to: '/tags/rights-by-country' },
    ],
    external: [
      {
        name: 'Rainbow Railroad',
        href: 'https://www.rainbowrailroad.org/',
        note: 'Helps LGBTQI+ people escape state-sponsored violence',
      },
      {
        name: 'ORAM',
        href: 'https://oramrefugee.org/',
        note: 'Support for LGBTIQ refugees and asylum seekers',
      },
      {
        name: 'UNHCR Help',
        href: 'https://help.unhcr.org/',
        note: 'Country-by-country asylum information',
      },
    ],
  },
  {
    id: 'trans-health',
    label: 'Trans health',
    hint: 'Hormones, care, finding providers',
    icon: HeartPulse,
    steps: [
      'If you cannot get your hormones, ask a doctor or pharmacy for a bridging prescription rather than stopping abruptly.',
      'Hormones from unregulated sources carry real risks. If you use them, get blood tests to check your levels.',
      'Trans-led groups often keep lists of providers who treat trans people well.',
      'You can bring someone you trust to appointments.',
    ],
    topics: ['trans'],
    links: [{ label: 'Gender-affirming care', to: '/tags/gender-affirming-care' }],
    external: [],
  },
  {
    id: 'drugs',
    label: 'Drugs & chemsex',
    hint: 'Overdose, harm reduction, support',
    icon: Pill,
    urgent:
      'If someone will not wake up, is breathing strangely or is turning blue: call the emergency number, put them on their side, and stay with them.',
    steps: [
      'Tell paramedics what was taken. They are there to treat, and that information saves lives.',
      'Never mix G (GHB/GBL) with alcohol, and leave at least 2 hours between doses.',
      'If opioids may be involved, naloxone reverses an overdose. Use it if you have it.',
      'Drug-checking services test what you have before you take it.',
      'If chemsex no longer feels in your control, chemsex support services work without judgement.',
    ],
    topics: ['health'],
    links: [
      { label: 'Chemsex', to: '/tags/chemsex' },
      { label: 'GHB', to: '/tags/ghb' },
      { label: 'Overdose', to: '/tags/overdose' },
      { label: 'Naloxone', to: '/tags/naloxone' },
      { label: 'Drug checking', to: '/tags/drug-checking' },
      { label: 'Harm reduction', to: '/tags/harm-reduction' },
    ],
    external: [],
  },
];

export function situationById(id: string | null | undefined): Situation {
  return SITUATIONS.find((s) => s.id === id) ?? SITUATIONS[0];
}
