import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * shadcn-style breadcrumb primitive — the single rendering vocabulary for
 * breadcrumbs across the app (global bar, detail pages, admin shell).
 * Monochrome design tokens only; no shadows/gradients.
 */
const Breadcrumb = forwardRef<HTMLElement, ComponentPropsWithoutRef<'nav'>>(
  function Breadcrumb({ ...props }, ref) {
    return <nav ref={ref} aria-label="Breadcrumb" {...props} />;
  },
);

const BreadcrumbList = forwardRef<HTMLOListElement, ComponentPropsWithoutRef<'ol'>>(
  function BreadcrumbList({ className, ...props }, ref) {
    return (
      <ol
        ref={ref}
        className={cn('flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground', className)}
        {...props}
      />
    );
  },
);

const BreadcrumbItem = forwardRef<HTMLLIElement, ComponentPropsWithoutRef<'li'>>(
  function BreadcrumbItem({ className, ...props }, ref) {
    return <li ref={ref} className={cn('inline-flex items-center gap-1.5', className)} {...props} />;
  },
);

type BreadcrumbLinkProps = ComponentPropsWithoutRef<'a'> & { asChild?: boolean };

const BreadcrumbLink = forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  function BreadcrumbLink({ asChild, className, ...props }, ref) {
    const Comp = asChild ? Slot : 'a';
    return (
      <Comp
        ref={ref}
        className={cn('no-underline transition-colors hover:text-foreground', className)}
        {...props}
      />
    );
  },
);

const BreadcrumbPage = forwardRef<HTMLSpanElement, ComponentPropsWithoutRef<'span'>>(
  function BreadcrumbPage({ className, ...props }, ref) {
    return (
      <span
        ref={ref}
        role="link"
        aria-disabled="true"
        aria-current="page"
        className={cn('font-medium text-foreground', className)}
        {...props}
      />
    );
  },
);

function BreadcrumbSeparator({ children, className, ...props }: ComponentPropsWithoutRef<'li'>) {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      className={cn('inline-flex items-center text-muted-foreground', className)}
      {...props}
    >
      {children ?? <ChevronRight size={14} />}
    </li>
  );
}

function BreadcrumbEllipsis({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      role="presentation"
      aria-hidden="true"
      className={cn('flex h-4 w-4 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontal size={14} />
      <span className="sr-only">More</span>
    </span>
  );
}

export type BreadcrumbCrumb = { label: ReactNode; href?: string };

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
