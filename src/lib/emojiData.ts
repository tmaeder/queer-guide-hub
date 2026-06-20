// Lightweight, keyword-indexed emoji catalogue for the chat picker. Curated
// (not the full Unicode set) to keep the bundle small while covering everyday
// reactions + a dedicated Pride group for the platform.

export interface EmojiEntry {
  e: string; // the emoji
  k: string; // space-separated search keywords
}

export interface EmojiCategory {
  id: string;
  /** i18n key suffix under `chat.emoji.cat.*`, with a sensible English default. */
  label: string;
  icon: string; // a representative emoji for the tab
  emojis: EmojiEntry[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emojis: [
      { e: '😀', k: 'grin happy smile' },
      { e: '😁', k: 'beaming grin happy' },
      { e: '😂', k: 'laugh tears joy lol' },
      { e: '🤣', k: 'rofl rolling laugh' },
      { e: '😊', k: 'blush smile happy' },
      { e: '😇', k: 'angel innocent halo' },
      { e: '🙂', k: 'slight smile' },
      { e: '😉', k: 'wink flirt' },
      { e: '😍', k: 'heart eyes love crush' },
      { e: '🥰', k: 'love hearts adore' },
      { e: '😘', k: 'kiss blow love' },
      { e: '😋', k: 'yum tasty tongue' },
      { e: '😎', k: 'cool sunglasses' },
      { e: '🤩', k: 'star struck excited wow' },
      { e: '🥳', k: 'party celebrate hooray' },
      { e: '😏', k: 'smirk sly' },
      { e: '😌', k: 'relieved calm' },
      { e: '🤔', k: 'thinking hmm' },
      { e: '🤨', k: 'raised eyebrow skeptic' },
      { e: '😐', k: 'neutral meh' },
      { e: '🙄', k: 'eye roll annoyed' },
      { e: '😴', k: 'sleep tired zzz' },
      { e: '🥺', k: 'pleading puppy please' },
      { e: '😢', k: 'cry sad tear' },
      { e: '😭', k: 'sob crying bawl' },
      { e: '😤', k: 'huff frustrated' },
      { e: '😡', k: 'angry mad rage' },
      { e: '🤯', k: 'mind blown shock' },
      { e: '😳', k: 'flushed embarrassed' },
      { e: '🥹', k: 'holding tears proud' },
      { e: '😬', k: 'grimace awkward' },
      { e: '🤗', k: 'hug embrace' },
      { e: '🤭', k: 'giggle oops shy' },
      { e: '🫠', k: 'melt hot overwhelmed' },
      { e: '😅', k: 'sweat nervous laugh' },
    ],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    icon: '👍',
    emojis: [
      { e: '👍', k: 'thumbs up yes like ok' },
      { e: '👎', k: 'thumbs down no dislike' },
      { e: '👏', k: 'clap applause bravo' },
      { e: '🙌', k: 'raise hands praise yay' },
      { e: '👋', k: 'wave hi hello bye' },
      { e: '🤙', k: 'call shaka hang loose' },
      { e: '✌️', k: 'peace victory' },
      { e: '🤞', k: 'fingers crossed hope luck' },
      { e: '🤝', k: 'handshake deal' },
      { e: '🙏', k: 'pray thanks please' },
      { e: '💪', k: 'muscle strong flex' },
      { e: '👀', k: 'eyes look watching' },
      { e: '🫶', k: 'heart hands love' },
      { e: '🤌', k: 'pinch italian' },
      { e: '👌', k: 'ok perfect' },
      { e: '🫰', k: 'finger heart love money' },
      { e: '🖖', k: 'spock vulcan' },
      { e: '🤟', k: 'love you sign ily' },
    ],
  },
  {
    id: 'hearts',
    label: 'Hearts',
    icon: '❤️',
    emojis: [
      { e: '❤️', k: 'red heart love' },
      { e: '🧡', k: 'orange heart' },
      { e: '💛', k: 'yellow heart' },
      { e: '💚', k: 'green heart' },
      { e: '💙', k: 'blue heart' },
      { e: '💜', k: 'purple heart' },
      { e: '🖤', k: 'black heart' },
      { e: '🤍', k: 'white heart' },
      { e: '🤎', k: 'brown heart' },
      { e: '💖', k: 'sparkling heart love' },
      { e: '💗', k: 'growing heart' },
      { e: '💕', k: 'two hearts love' },
      { e: '💞', k: 'revolving hearts' },
      { e: '💓', k: 'beating heart' },
      { e: '💘', k: 'cupid arrow heart' },
      { e: '💝', k: 'heart gift' },
      { e: '❣️', k: 'heart exclamation' },
      { e: '💔', k: 'broken heart sad' },
      { e: '❤️‍🔥', k: 'heart fire passion' },
      { e: '🩷', k: 'pink heart' },
      { e: '🩵', k: 'light blue heart' },
    ],
  },
  {
    id: 'pride',
    label: 'Pride',
    icon: '🏳️‍🌈',
    emojis: [
      { e: '🏳️‍🌈', k: 'pride rainbow flag lgbt gay' },
      { e: '🏳️‍⚧️', k: 'trans flag transgender' },
      { e: '🌈', k: 'rainbow pride' },
      { e: '❤️‍🔥', k: 'love passion' },
      { e: '💖', k: 'love sparkle' },
      { e: '✨', k: 'sparkle shine glam' },
      { e: '💅', k: 'nails sass fabulous' },
      { e: '👑', k: 'crown queen king royalty' },
      { e: '🦄', k: 'unicorn magic queer' },
      { e: '🔥', k: 'fire hot lit' },
      { e: '💃', k: 'dance party' },
      { e: '🕺', k: 'dance disco' },
      { e: '🎉', k: 'party celebrate' },
      { e: '🫶', k: 'love hands community' },
      { e: '🦋', k: 'butterfly transform' },
    ],
  },
  {
    id: 'animals',
    label: 'Animals',
    icon: '🐶',
    emojis: [
      { e: '🐶', k: 'dog puppy' },
      { e: '🐱', k: 'cat kitten' },
      { e: '🦊', k: 'fox' },
      { e: '🐻', k: 'bear' },
      { e: '🐼', k: 'panda' },
      { e: '🐨', k: 'koala' },
      { e: '🦁', k: 'lion' },
      { e: '🐯', k: 'tiger' },
      { e: '🐸', k: 'frog' },
      { e: '🐵', k: 'monkey' },
      { e: '🐧', k: 'penguin' },
      { e: '🐦', k: 'bird' },
      { e: '🦄', k: 'unicorn' },
      { e: '🐝', k: 'bee' },
      { e: '🦋', k: 'butterfly' },
      { e: '🐢', k: 'turtle' },
      { e: '🐙', k: 'octopus' },
      { e: '🦖', k: 'dino t-rex' },
    ],
  },
  {
    id: 'food',
    label: 'Food',
    icon: '🍕',
    emojis: [
      { e: '🍕', k: 'pizza' },
      { e: '🍔', k: 'burger' },
      { e: '🌮', k: 'taco' },
      { e: '🍣', k: 'sushi' },
      { e: '🍜', k: 'noodles ramen' },
      { e: '🍦', k: 'ice cream' },
      { e: '🍰', k: 'cake dessert' },
      { e: '🎂', k: 'birthday cake' },
      { e: '🍪', k: 'cookie' },
      { e: '🍩', k: 'donut' },
      { e: '🍫', k: 'chocolate' },
      { e: '☕', k: 'coffee tea' },
      { e: '🍵', k: 'tea matcha' },
      { e: '🍷', k: 'wine' },
      { e: '🍸', k: 'cocktail martini' },
      { e: '🍺', k: 'beer' },
      { e: '🥂', k: 'cheers champagne toast' },
      { e: '🍓', k: 'strawberry' },
    ],
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: '🎉',
    emojis: [
      { e: '🎉', k: 'party tada celebrate' },
      { e: '🎊', k: 'confetti party' },
      { e: '🎈', k: 'balloon' },
      { e: '🎁', k: 'gift present' },
      { e: '🏆', k: 'trophy win' },
      { e: '🥇', k: 'gold medal first' },
      { e: '⚽', k: 'soccer football' },
      { e: '🏀', k: 'basketball' },
      { e: '🎮', k: 'game controller' },
      { e: '🎧', k: 'headphones music' },
      { e: '🎵', k: 'music note' },
      { e: '🎤', k: 'mic sing karaoke' },
      { e: '🎨', k: 'art paint' },
      { e: '📸', k: 'camera photo' },
      { e: '✈️', k: 'plane travel trip' },
      { e: '🏖️', k: 'beach holiday' },
      { e: '🗺️', k: 'map travel' },
      { e: '🏳️‍🌈', k: 'pride parade' },
    ],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    icon: '✨',
    emojis: [
      { e: '✨', k: 'sparkles shine' },
      { e: '⭐', k: 'star' },
      { e: '🌟', k: 'glowing star' },
      { e: '💫', k: 'dizzy star' },
      { e: '🔥', k: 'fire lit hot' },
      { e: '💯', k: 'hundred perfect' },
      { e: '✅', k: 'check done yes' },
      { e: '❌', k: 'cross no wrong' },
      { e: '❗', k: 'exclamation important' },
      { e: '❓', k: 'question' },
      { e: '💬', k: 'speech chat message' },
      { e: '👁️‍🗨️', k: 'eye witness' },
      { e: '💤', k: 'sleep zzz' },
      { e: '💥', k: 'boom collision' },
      { e: '💢', k: 'anger mad' },
      { e: '⚡', k: 'lightning energy' },
      { e: '🎯', k: 'target bullseye' },
      { e: '🆗', k: 'ok button' },
    ],
  },
];

// Quick-react bar shown on hover over a message.
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🏳️‍🌈'];

const ALL: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

/** Keyword search across the whole catalogue (deduped, capped). */
export function searchEmojis(query: string, limit = 60): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const out: EmojiEntry[] = [];
  for (const entry of ALL) {
    if (entry.k.includes(q) && !seen.has(entry.e)) {
      seen.add(entry.e);
      out.push(entry);
      if (out.length >= limit) break;
    }
  }
  return out;
}
