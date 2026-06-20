// Zero-dependency playful message rendering helpers.

// Matches emoji, ZWJ, variation selectors, and skin-tone modifiers.
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|‍|️|[\u{1F3FB}-\u{1F3FF}]|\s)+$/u;
const GRAPHEME = /\p{Extended_Pictographic}/gu;

/**
 * "Jumbo" emoji: a text message that is only emoji (≤ 3) renders large and
 * chrome-less, like iMessage. Returns the tier (0 = normal) for sizing.
 */
export function jumboTier(content: string): 0 | 1 | 2 {
  const text = content.trim();
  if (!text || text.length > 40 || !EMOJI_ONLY.test(text)) return 0;
  const count = (text.match(GRAPHEME) ?? []).length;
  if (count === 0 || count > 3) return 0;
  return count === 1 ? 2 : 1;
}

export interface Sticker {
  id: string;
  emoji: string;
  label: string;
}

// A small, bundled queer-joy sticker pack — no external service, no storage.
// Sent as message_type='sticker' with content = sticker emoji; rendered large.
export const STICKERS: Sticker[] = [
  { id: 'pride', emoji: '🏳️‍🌈', label: 'Pride' },
  { id: 'trans', emoji: '🏳️‍⚧️', label: 'Trans pride' },
  { id: 'love', emoji: '💖', label: 'Love' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'slay', emoji: '💅', label: 'Slay' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { id: 'party', emoji: '🎉', label: 'Party' },
  { id: 'sparkle', emoji: '✨', label: 'Sparkle' },
  { id: 'dance', emoji: '💃', label: 'Dance' },
  { id: 'crown', emoji: '👑', label: 'Crown' },
  { id: 'butterfly', emoji: '🦋', label: 'Butterfly' },
  { id: 'rainbow', emoji: '🌈', label: 'Rainbow' },
  { id: 'wink', emoji: '😉', label: 'Wink' },
  { id: 'melt', emoji: '🫠', label: 'Melt' },
  { id: 'hands', emoji: '🫶', label: 'Heart hands' },
  { id: 'star', emoji: '🌟', label: 'Star' },
];
