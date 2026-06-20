// Curated conversation sparks for the 1:1 composer "spark" button. Kept local
// (no DB/cron) — light, warm, queer-friendly openers. Tone stays factual-ish
// per the copy rules; these are prompts the user can edit before sending.
export const ICEBREAKERS: string[] = [
  "What's the best queer spot in your city?",
  'Coffee, drinks, or a walk — what is your kind of first meet?',
  'What are you into lately?',
  "What's a place you'd love to travel to next?",
  'Early bird or night owl?',
  "What's bringing you joy this week?",
  'Drag, dancing, or a quiet night in?',
  'What song is on repeat for you right now?',
  'Best Pride memory?',
  'What made you smile today?',
  "Recommend me one thing — show, book, or place.",
  'What does a perfect weekend look like for you?',
];

/** Pick an icebreaker, varying by an index so repeats are spread out. */
export function pickIcebreaker(seed: number): string {
  return ICEBREAKERS[Math.abs(seed) % ICEBREAKERS.length];
}
