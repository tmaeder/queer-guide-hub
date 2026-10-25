import { C, G, M, Y, colored, flipX, ring, rot, tinted, type IconDef } from '../iconKit';

/** Icon System v2 — batch d of the interface set that replaced lucide-react.
 *  Safety, identity and people. */

const SHIELD =
  'M 50 16 C 60 22 70 24 80 24 C 81 50 72 72 50 86 C 28 72 19 50 20 24 C 30 24 40 22 50 16 Z';

const LOCK_BODY =
  'M 26 46 C 40 44.5 60 44.5 74 46 C 75.5 57 75.5 70 74 82 C 60 83.5 40 83.5 26 82 C 24.5 70 24.5 57 26 46 Z';
const KEYHOLE = 'M 50 57 C 48.5 61 48.5 66 50 71';

// Drawn once pointing up; the down thumb is its vertical mirror so the pair
// cannot drift apart. Cuff stays on the left in both.
const THUMB_HAND =
  'M 34 48 C 40 40 44 32 46 22 C 47 16 56 16 58 22 C 60 30 58 38 56 44 C 64 44 72 44 78 46 C 84 48 86 54 82 58 C 86 62 84 68 80 70 C 82 76 78 82 72 82 C 58 83.5 46 83.5 34 82 C 32.5 70 32.5 58 34 48 Z';
const THUMB_CUFF =
  'M 16 48 C 21 47 25 47 28 48 C 29.5 60 29.5 72 28 82 C 24 83 20 83 16 82 C 14.5 72 14.5 60 16 48 Z';
const THUMB_KNUCKLES = ['M 82 58 C 76 57 70 59 64 58', 'M 80 70 C 74 69 68 71 62 70'];
const flipY = (d: string) => rot(flipX(d), 2);

// One diagonal band stripe of the lifebuoy, rotated into all four quadrants.
const BUOY_STRIPE = 'M 60 40 C 63 35 69 32 74 26';

export const BATCH_D = {
  shield: {
    name: 'Safety shield',
    group: 'Safety',
    hex: G,
    t: 'none',
    use: 'Safety information, protection and trust.',
    f: [[SHIELD, 'T']],
  },

  'shield-check': {
    name: 'Verified safe',
    group: 'Safety',
    hex: G,
    t: 'none',
    use: 'Verified, checked or safe-rated places and people.',
    f: [[SHIELD, 'T']],
    l: ['M 36 50 C 39 55 43 59 47 62 C 52 52 58 43 65 36'],
  },

  'shield-alert': {
    name: 'Safety warning',
    group: 'Safety',
    hex: Y,
    t: 'none',
    use: 'Safety warnings, risks and unsafe or unprotected states.',
    f: [[SHIELD, 'T']],
    l: ['M 50 32 C 48.5 40 48.5 47 50 54', ring(50, 66, 3)],
  },

  lock: {
    name: 'Locked',
    group: 'Safety',
    hex: C,
    t: 'none',
    use: 'Private, locked or members-only content.',
    f: [[LOCK_BODY, 'T']],
    l: ['M 36 46 C 35 30 40 20 50 20 C 60 20 65 30 64 46', KEYHOLE],
  },

  unlock: {
    name: 'Unlocked',
    group: 'Safety',
    hex: C,
    t: 'none',
    use: 'Unlocked, public or newly opened content.',
    f: [[LOCK_BODY, 'T']],
    // The right leg stops short of the body: an open shackle.
    l: ['M 36 46 C 35 30 40 20 50 20 C 59 20 63 25 65 32', KEYHOLE],
  },

  'access-key': {
    name: 'Access key',
    group: 'Safety',
    hex: Y,
    t: 'none',
    use: 'Passwords, access codes and sign-in credentials.',
    // A strap, not a filled bow: a filled ring with a counter left only a thin
    // band of colour and read as an all-ink key.
    l: [
      ...colored(`${ring(32, 34, 13)} M 42 44 C 52 56 66 64 78 78`),
      'M 62 68 C 59 70 57 72 56 75',
      'M 71 76 C 68 78 66 80 65 83',
    ],
  },

  identity: {
    name: 'ID card',
    group: 'People',
    hex: C,
    t: 'none',
    use: 'Identity, verification and ID documents.',
    f: [
      [
        'M 16 32 C 16 27 19 24 24 24 C 41 22.5 59 22.5 76 24 C 81 24 84 27 84 32 C 85.5 44 85.5 56 84 68 C 84 73 81 76 76 76 C 59 77.5 41 77.5 24 76 C 19 76 16 73 16 68 C 14.5 56 14.5 44 16 32 Z',
        'T',
      ],
    ],
    l: [
      ring(36, 43, 7),
      'M 24 66 C 26 58 30 55 36 55 C 42 55 46 58 48 66',
      'M 56 40 C 62 38.5 68 38.5 74 40',
      'M 56 54 C 61 52.5 65 52.5 70 54',
    ],
  },

  'user-add': {
    name: 'Add person',
    group: 'People',
    hex: G,
    t: 'none',
    use: 'Invite, follow or add someone.',
    l: [
      ...tinted(
        `${ring(40, 34, 12)} M 16 78 C 20 62 28 56 40 56 C 52 56 60 62 64 78 M 75 26 C 73.5 32 73.5 40 75 46 M 65 36 C 71 34.5 79 34.5 85 36`,
      ),
    ],
  },

  'user-remove': {
    name: 'Remove person',
    group: 'People',
    hex: M,
    t: 'none',
    use: 'Remove, unfollow or block someone.',
    l: [
      ...tinted(
        `${ring(40, 34, 12)} M 16 78 C 20 62 28 56 40 56 C 52 56 60 62 64 78 M 65 36 C 71 34.5 79 34.5 85 36`,
      ),
    ],
  },

  care: {
    name: 'Helping hand',
    group: 'Community',
    hex: C,
    t: 'none',
    use: 'Care, support, mutual aid and partnerships.',
    f: [
      [
        'M 50 56 C 40 48 32 42 32 34 C 32 28 36 24 42 24 C 46 24 49 26 50 30 C 51 26 54 24 58 24 C 64 24 68 28 68 34 C 68 42 60 48 50 56 Z',
        'T',
      ],
    ],
    // An open palm cupped under the heart: fingers to the right, thumb up.
    l: [
      'M 14 70 C 22 66 30 64 38 66 C 44 67 50 69 56 68 C 62 67 64 62 60 60 C 54 59 48 61 44 62',
      'M 14 82 C 28 80 42 82 54 80 C 64 78 74 72 86 62 C 84 56 78 56 72 60 C 68 64 63 64 60 66',
    ],
  },

  lifebuoy: {
    name: 'Lifebuoy',
    group: 'Safety',
    hex: G,
    t: 'none',
    use: 'Help centre, rescue and emergency support.',
    f: [
      [ring(50, 50, 34), 'T'],
      [ring(50, 50, 14), 'P'],
    ],
    l: [BUOY_STRIPE, rot(BUOY_STRIPE, 1), rot(BUOY_STRIPE, 2), rot(BUOY_STRIPE, 3)],
  },

  accessibility: {
    name: 'Wheelchair access',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Accessibility, step-free access and access needs.',
    // The access symbol: head, seated body, open wheel. No face — the head is
    // a dot.
    l: [
      ...tinted(
        `${ring(46, 21, 7)} M 44 32 C 42.5 42 42.5 50 44 58 C 53 59.5 61 58.5 68 59 C 74 64 74 72 78 80 M 44 43 C 51 41.5 57 41.5 64 43 M 30 46 C 20 54 20 72 30 80 C 38 86 52 86 60 78`,
      ),
    ],
  },

  hand: {
    name: 'Raised hand',
    group: 'People',
    hex: Y,
    t: 'none',
    use: 'Stop, wave, ask a question or raise a hand.',
    f: [
      [
        'M 36 84 C 30 78 26 72 22 64 C 18 57 14 51 17 47 C 20 43 26 46 31 53 C 30 42 30 30 32 22 C 34 14 66 14 68 22 C 70 34 70 50 68 62 C 66 72 62 78 60 84 C 52 85.5 44 85.5 36 84 Z',
        'T',
      ],
    ],
    l: [
      'M 42 25 C 40.5 31 40.5 37 42 42',
      'M 51 23 C 49.5 30 49.5 36 51 42',
      'M 60 25 C 58.5 31 58.5 37 60 42',
    ],
  },

  landmark: {
    name: 'Courthouse',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Law, rights, courts and government institutions.',
    f: [['M 14 40 C 28 28 40 18 50 14 C 60 18 72 28 86 40 C 62 42 38 42 14 40 Z', 'T']],
    l: [
      'M 28 48 C 26.5 56 26.5 64 28 72',
      'M 50 48 C 48.5 56 48.5 64 50 72',
      'M 72 48 C 70.5 56 70.5 64 72 72',
      'M 18 82 C 40 80.5 60 80.5 82 82',
    ],
  },

  education: {
    name: 'Graduation cap',
    group: 'Community',
    hex: Y,
    t: 'none',
    use: 'Education, schools, courses and learning.',
    f: [
      [
        'M 50 24 C 61 27 74 32 86 40 C 74 47 61 53 50 56 C 39 53 26 47 14 40 C 26 33 39 27 50 24 Z',
        'T',
      ],
    ],
    l: [
      'M 28 52 C 27 60 27 64 28 68 C 42 75 58 75 72 68 C 73 64 73 60 72 52',
      'M 80 44 C 81.5 52 81.5 60 80 68',
    ],
  },

  briefcase: {
    name: 'Briefcase',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Work, jobs, business and professional services.',
    f: [
      [
        'M 18 38 C 18 34 21 32 26 32 C 42 30.5 58 30.5 74 32 C 79 32 82 34 82 38 C 83.5 52 83.5 66 82 78 C 82 82 79 84 74 84 C 58 85.5 42 85.5 26 84 C 21 84 18 82 18 78 C 16.5 66 16.5 52 18 38 Z',
        'T',
      ],
    ],
    l: ['M 38 32 C 38 22 40 20 50 20 C 60 20 62 22 62 32', 'M 18 54 C 38 56.5 62 56.5 82 54'],
  },

  bot: {
    name: 'Bot',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Automated replies, assistants and machine-made content.',
    // A visor, not two eyes: a robot with eyes is a face.
    f: [
      [
        'M 22 42 C 22 37 25 34 30 34 C 43 32.5 57 32.5 70 34 C 75 34 78 37 78 42 C 79.5 54 79.5 66 78 76 C 78 81 75 84 70 84 C 57 85.5 43 85.5 30 84 C 25 84 22 81 22 76 C 20.5 66 20.5 54 22 42 Z',
        'T',
      ],
      [
        'M 32 50 C 44 48.5 56 48.5 68 50 C 69.5 56 69.5 62 68 68 C 56 69.5 44 69.5 32 68 C 30.5 62 30.5 56 32 50 Z',
        'P',
      ],
    ],
    l: [
      'M 50 34 C 48.5 30 48.5 26 50 22',
      ring(50, 18, 4),
      'M 15 52 C 13.5 56 13.5 62 15 66',
      'M 85 52 C 86.5 56 86.5 62 85 66',
    ],
  },

  smile: {
    name: 'Smiley',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Reactions, emoji, stickers and mood.',
    f: [[ring(50, 50, 34), 'T']],
    l: [`${ring(38, 42, 3.5)} ${ring(62, 42, 3.5)}`, 'M 34 58 C 40 68 60 68 66 58'],
  },

  'thumbs-up': {
    name: 'Thumbs up',
    group: 'Actions',
    hex: G,
    t: 'none',
    use: 'Like, approve or recommend.',
    f: [
      [THUMB_CUFF, 'T'],
      [THUMB_HAND, 'T'],
    ],
    l: THUMB_KNUCKLES,
  },

  'thumbs-down': {
    name: 'Thumbs down',
    group: 'Actions',
    hex: M,
    t: 'none',
    use: 'Dislike, disapprove or flag as unhelpful.',
    f: [
      [flipY(THUMB_CUFF), 'T'],
      [flipY(THUMB_HAND), 'T'],
    ],
    l: THUMB_KNUCKLES.map(flipY),
  },

  megaphone: {
    name: 'Megaphone',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Announcements, campaigns and calls to action.',
    f: [
      [
        'M 26 42 C 44 40 58 34 76 22 C 79 40 79 62 76 80 C 58 68 44 62 26 60 C 20 60 16 56 16 51 C 16 46 20 42 26 42 Z',
        'T',
      ],
    ],
    l: ['M 34 61 C 36 68 38 74 42 80'],
  },

  news: {
    name: 'Newspaper',
    group: 'Community',
    hex: C,
    t: 'none',
    use: 'News articles, feeds and press coverage.',
    f: [
      [
        'M 26 28 C 26 24 28 22 32 22 C 48 20.5 64 20.5 78 22 C 82 22 84 24 84 28 C 85.5 44 85.5 60 84 74 C 84 78 82 80 78 80 C 60 81.5 42 81.5 24 80 C 26 78 26 76 26 72 C 24.5 56 24.5 42 26 28 Z',
        'T',
      ],
    ],
    l: [
      'M 26 40 C 20 40 16 42 16 46 C 14.5 56 14.5 66 16 74 C 17 78 20 80 24 80',
      'M 36 34 C 50 32.5 62 32.5 74 34',
      'M 36 52 C 48 50.5 60 50.5 74 52',
      'M 36 66 C 46 64.5 56 64.5 66 66',
    ],
  },

  phone: {
    name: 'Mobile phone',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Phone numbers, calls and mobile contact.',
    f: [
      [
        'M 32 22 C 32 17 35 14 40 14 C 47 13 53 13 60 14 C 65 14 68 17 68 22 C 69.5 40 69.5 60 68 78 C 68 83 65 86 60 86 C 53 87 47 87 40 86 C 35 86 32 83 32 78 C 30.5 60 30.5 40 32 22 Z',
        'T',
      ],
    ],
    l: ['M 44 23 C 48 21.5 52 21.5 56 23', ring(50, 76, 3)],
  },
} satisfies Record<string, IconDef>;
