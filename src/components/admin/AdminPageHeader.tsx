import * as React from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { getEyebrowForRoute, getNavItemByRoute } from '@/config/adminNavigation';

interface AdminPageHeaderProps {
  /** Short uppercase context, e.g. "CONTENT · VENUES". Defaults to a value
   *  derived from the current route when omitted. Pass `null` to suppress. */
  eyebrow?: React.ReactNode | null;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional explicit back link. When omitted, a `?from=` query param (a route)
   *  renders an automatic "← Back" link. */
  backTo?: { label: string; route: string };
  className?: string;
  children?: React.ReactNode;
}

/**
 * Static page header for the admin console — no motion imports
 * (admin tree forbids framer-motion / motion/react).
 *
 * Sits below the AdminShell breadcrumb bar and replaces ad-hoc <h1>
 * blocks across admin pages. Eyebrow defaults to the route context so
 * pages only need to pass a title.
 */
export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  backTo,
  className,
  children,
}: AdminPageHeaderProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const resolvedEyebrow =
    eyebrow === undefined ? getEyebrowForRoute(location.pathname) : eyebrow;

  // Auto back-link: explicit prop wins, else a `?from=` route param.
  const fromParam = searchParams.get('from');
  const back =
    backTo ??
    (fromParam
      ? { route: fromParam, label: getNavItemByRoute(fromParam)?.label ?? 'Back' }
      : null);

  return (
    <header
      className={cn(
        'mb-6 flex flex-col gap-4 border-b border-hairline pb-6 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {back && (
          <Link
            to={back.route}
            className="mb-2 inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground no-underline hover:text-foreground"
          >
            <ArrowLeft size={12} aria-hidden />
            Back to {back.label}
          </Link>
        )}
        {resolvedEyebrow && <Eyebrow as="div" className="mb-2">{resolvedEyebrow}</Eyebrow>}
        <h1 className="text-headline md:text-headline-lg font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && <p className="mt-2 max-w-2xl text-13 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      {children && <div className="w-full">{children}</div>}
    </header>
  );
}
