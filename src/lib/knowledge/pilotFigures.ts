export interface PilotFigure {
  id: string;
  title: string;
  summary: string;
  caption: string;
  layout: 'parallel' | 'network' | 'timeline' | 'cycle';
  rows: readonly (readonly [string, string])[];
  sources: readonly { title: string; url: string; supports: string }[];
}
export const PILOT_FIGURES: readonly PilotFigure[] = [
  {
    id: 'identity-expression-orientation',
    title: 'Three different questions',
    summary:
      'Gender identity, gender expression and orientation answer different questions; none predicts the others.',
    caption:
      'These are dimensions of experience, not three boxes that describe everyone completely.',
    layout: 'parallel',
    rows: [
      ['Identity', 'How do I understand my gender?'],
      ['Expression', 'How do I present or express myself?'],
      ['Orientation', 'How do I describe attraction?'],
    ],
    sources: [
      {
        title: 'GLAAD: transgender terms',
        url: 'https://glaad.org/reference/trans-terms/',
        supports: 'Identity, expression and orientation are distinct.',
      },
    ],
  },
  {
    id: 'attraction-dimensions',
    title: 'Attraction does not have one setting',
    summary:
      'Romantic attraction, sexual attraction and the desire for a relationship can differ for the same person.',
    caption:
      'Examples of distinct experiences. This is not a diagnostic scale or a test of anyone’s identity.',
    layout: 'parallel',
    rows: [
      ['Romantic', 'Wanting a romantic connection'],
      ['Sexual', 'Experiencing sexual attraction'],
      ['Relationship', 'Wanting a particular kind of connection'],
    ],
    sources: [
      {
        title: 'GLAAD: LGBTQ terms',
        url: 'https://glaad.org/reference/terms/',
        supports: 'Orientation and attraction are not inferred from sexual experience.',
      },
      {
        title: 'AVEN: overview',
        url: 'https://www.asexuality.org/?q=overview.html',
        supports: 'Sexual attraction, romantic orientation and relationships need not align.',
      },
    ],
  },
  {
    id: 'chosen-family-network',
    title: 'Care makes the connections',
    summary:
      'A person may receive practical help, companionship, advocacy and everyday care from different chosen-family relationships.',
    caption:
      'An illustrative network, not a required family structure. Ask people whom they want involved.',
    layout: 'network',
    rows: [
      ['Companionship', 'Sharing everyday life'],
      ['Practical help', 'Offering time, food or transport'],
      ['Advocacy', 'Showing up when support is needed'],
      ['Mutual care', 'Giving and receiving care'],
    ],
    sources: [
      {
        title: 'The Trevor Project: chosen family',
        url: 'https://www.thetrevorproject.org/blog/ways-young-folks-can-celebrate-pride/',
        supports: 'Chosen-family relationships can provide connection and support.',
      },
    ],
  },
  {
    id: 'relationship-agreements',
    title: 'Make the agreement explicit',
    summary:
      'Partners can discuss time, boundaries, expectations and changes without assuming a relationship label answers those questions.',
    caption:
      'Conversation prompts for different relationship structures. Every participant can set boundaries.',
    layout: 'cycle',
    rows: [
      ['Ask', 'What kind of connection do we want?'],
      ['Discuss', 'What expectations and boundaries matter?'],
      ['Agree', 'What have we each freely agreed to?'],
      ['Revisit', 'What has changed, and what needs to change?'],
    ],
    sources: [
      {
        title: 'Scarleteen: relationships',
        url: 'https://www.scarleteen.com/read/relationships',
        supports: 'Communication and boundaries matter in relationships.',
      },
    ],
  },
  {
    id: 'queer-history-connections',
    title: 'Different places, connected histories',
    summary:
      'A selective timeline connects organising in Berlin, community care in New York and the rainbow flag in San Francisco.',
    caption:
      'Three documented moments, not a complete history or a claim that queer organising began in one country.',
    layout: 'timeline',
    rows: [
      ['1897 · Berlin', 'Scientific-Humanitarian Committee founded'],
      ['1970 · New York', 'Johnson and Rivera establish STAR'],
      ['1978 · San Francisco', 'Rainbow flag first flown'],
    ],
    sources: [
      {
        title: 'Magnus Hirschfeld Society',
        url: 'https://magnus-hirschfeld.de/',
        supports: 'Hirschfeld’s organising and the Scientific-Humanitarian Committee.',
      },
      {
        title: 'National Park Service: LGBTQ history',
        url: 'https://www.nps.gov/subjects/lgbtqheritage/index.htm',
        supports: 'Community organising and historic places.',
      },
      {
        title: 'Gilbert Baker Foundation',
        url: 'https://gilbertbaker.com/',
        supports: 'The rainbow flag’s creation in 1978.',
      },
    ],
  },
  {
    id: 'consent-conversation',
    title: 'Check in, and keep listening',
    summary:
      'Ask without pressure, listen for freely given agreement, check in and stop when agreement is absent or withdrawn.',
    caption:
      'A conversation guide, not a legal test. Silence or a previous agreement does not establish present consent.',
    layout: 'cycle',
    rows: [
      ['Ask', 'Leave room for any answer'],
      ['Listen', 'Uncertainty means pause'],
      ['Check in', 'Agreement can change'],
      ['Stop', 'Respect a no or withdrawal immediately'],
    ],
    sources: [
      {
        title: 'Rape Crisis: what is consent?',
        url: 'https://rapecrisis.org.uk/get-informed/types-of-sexual-violence/what-is-consent/',
        supports: 'Consent is freely given, ongoing and can be withdrawn.',
      },
      {
        title: 'RAINN: consent',
        url: 'https://rainn.org/articles/what-is-consent',
        supports: 'Consent must not be assumed from silence or past agreement.',
      },
    ],
  },
];
export function pilotFigure(id: string) {
  return PILOT_FIGURES.find((figure) => figure.id === id);
}
