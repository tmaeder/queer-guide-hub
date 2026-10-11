import { useTranslation } from 'react-i18next';

/**
 * "N friends online" as a trailing count — a dot, the number, and an `sr-only`
 * sentence that is the only thing AT reads.
 *
 * Extracted because the header's avatar menu and the mobile nav sheet carried
 * this block byte-for-byte identically, down to the `aria-hidden` on both
 * visible parts and the pluralised `sr-only` string. Both copies also used a
 * raw `text-xs` (12px, off the micro-scale ladder).
 *
 * Renders nothing while the count is still loading (`null`), which is what
 * both call sites did and what `HeaderFriendsOnline.test.tsx` asserts.
 */
export interface FriendsOnlineCountProps {
  /** `null` means "not loaded yet" — render nothing rather than a zero. */
  count: number | null;
}

export function FriendsOnlineCount({ count }: FriendsOnlineCountProps) {
  const { t } = useTranslation();
  if (count === null) return null;
  return (
    <span className="ml-auto flex items-center gap-1.5 text-13 tabular-nums text-muted-foreground">
      <span aria-hidden className="h-2 w-2 rounded-full bg-foreground" />
      <span aria-hidden>{count}</span>
      <span className="sr-only">
        {t('header.userMenu.friendsOnline', '{{count}} online', { count })}
      </span>
    </span>
  );
}
