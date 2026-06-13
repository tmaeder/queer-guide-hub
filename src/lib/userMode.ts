/** Plain-language labels for user_mode values — never show the raw enum. */
export const USER_MODE_LABELS: Record<string, string> = {
  dating: 'Looking for Love',
  friends: 'Making Friends',
  exploration: 'Exploring',
  fun: 'Here for Fun',
  networking: 'Networking',
  community: 'Building Community',
};

export function userModeLabel(mode: string): string {
  return USER_MODE_LABELS[mode] ?? 'Exploring';
}
