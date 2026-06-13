/**
 * Estimate reading time in whole minutes from a block of plain text.
 * 220 wpm is a common average for adult online reading. Always ≥1 min so a
 * short item never reads "0 min read".
 */
export function estimateReadingTime(text: string | null | undefined): number {
  if (!text) return 1;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
