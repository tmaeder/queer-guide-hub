import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/**
 * The signed-in identity line — avatar, then `@username` or the email as a
 * fallback.
 *
 * Extracted because it existed TWICE, byte-for-byte: once in the header's
 * avatar menu and once at the top of the mobile nav sheet, both carrying the
 * same two raw `text-sm` classes (14px, which is off the micro-scale ladder —
 * it sits between `--text-13` and `--text-15`). Two copies of one row drift as
 * a unit, and they already carried the identical defect twice over.
 *
 * `avatarPx` is a number rather than a size token because the two call sites
 * genuinely differ — 36px in the dense dropdown, 40px in the sheet — and an
 * avatar diameter is an element-sizing constraint, which the spacing rules
 * exempt.
 */
export interface IdentityRowProps {
  avatarSrc?: string;
  avatarInitial: string;
  username: string | null;
  /** Shown only when there is no username. */
  email: string | null;
  /** Rendered when neither a username nor an email is available. */
  fallbackLabel: string;
  avatarPx?: number;
  className?: string;
}

export function IdentityRow({
  avatarSrc,
  avatarInitial,
  username,
  email,
  fallbackLabel,
  avatarPx = 36,
  className,
}: IdentityRowProps) {
  return (
    <>
      <Avatar style={{ height: avatarPx, width: avatarPx }}>
        {/* `alt=""` deliberately: the name sits beside it in text, so a
            described avatar would make every screen reader say it twice. */}
        <AvatarImage src={avatarSrc} alt="" />
        <AvatarFallback>{avatarInitial}</AvatarFallback>
      </Avatar>
      <span className={cn('flex min-w-0 flex-col', className)}>
        {username ? (
          <span className="truncate font-mono text-15 font-semibold">@{username}</span>
        ) : (
          <span className="truncate text-15 font-semibold">{email || fallbackLabel}</span>
        )}
      </span>
    </>
  );
}
