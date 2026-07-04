import { LocalizedLink } from '@/components/routing/LocalizedLink';

interface SectionHeaderProps {
  /** id for the h2, referenced by the section's aria-labelledby. */
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: { label: string; to: string };
  className?: string;
}

/** Shared editorial section header: eyebrow, display-face title, quiet action link. */
export function SectionHeader({ id, eyebrow, title, subtitle, action, className }: SectionHeaderProps) {
  return (
    <div className={className ?? 'mb-6 flex items-end justify-between gap-4'}>
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-2xs uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
        )}
        <h2 id={id} className="font-display text-headline-lg tracking-tight">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && (
        <LocalizedLink
          to={action.to}
          className="hidden shrink-0 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground md:inline"
        >
          {action.label}
        </LocalizedLink>
      )}
    </div>
  );
}
