/**
 * FlagChip — a pride flag as a small labelled chip (profile headers, the
 * settings picker). The swatch is decorative; the text label carries the
 * meaning, so the chip is never colour-only.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { FlagSwatch } from '@/components/tags/FlagSwatch';
import { flagById } from '@/lib/flags';

export function FlagChip({ flagId, className }: { flagId: string; className?: string }) {
  const { t } = useTranslation();
  const flag = flagById(flagId);
  // Unknown id (vocabulary drift) renders nothing rather than crashing.
  if (!flag) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 bg-muted rounded-element px-2 py-0.5 text-2xs font-bold',
        className,
      )}
    >
      <FlagSwatch flag={flag} decorative className="h-3 w-5 border" />
      {t(flag.nameKey, flag.nameEn)}
    </span>
  );
}

/** A row of flag chips; renders nothing when every id is unknown or the list is empty. */
export function FlagChipRow({
  flagIds,
  className,
}: {
  flagIds: readonly string[] | null | undefined;
  className?: string;
}) {
  const known = (flagIds ?? []).filter((id) => flagById(id));
  if (known.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {known.map((id) => (
        <FlagChip key={id} flagId={id} />
      ))}
    </div>
  );
}
