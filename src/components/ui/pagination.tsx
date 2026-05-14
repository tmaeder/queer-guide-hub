import * as React from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

const Pagination = ({ className, style, ...props }: React.ComponentProps<"nav">) => (
  <nav role="navigation" aria-label="pagination" className={className}
    style={{ display: 'flex', width: '100%', justifyContent: 'center', margin: '0 auto', ...style }} {...props} />
);
Pagination.displayName = "Pagination"

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  ({ className, style, ...props }, ref) => (
    <ul ref={ref} className={className} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4, listStyle: 'none', padding: 0, margin: 0, ...style }} {...props} />
  )
);
PaginationContent.displayName = "PaginationContent"

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(
  ({ className, ...props }, ref) => <li ref={ref} className={className} {...props} />
);
PaginationItem.displayName = "PaginationItem"

type PaginationLinkProps = {
  isActive?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
} & React.ComponentProps<"a">

const PaginationLink = ({ className, isActive, size = "icon", children, style, ...props }: PaginationLinkProps) => (
  <a
    aria-current={isActive ? "page" : undefined}
    className={className}
    style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 9999, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
      textDecoration: 'none',
      minWidth: size === "icon" ? 40 : undefined, height: 40,
      padding: size === "icon" ? 0 : '0 16px',
      border: isActive ? '1px solid hsl(var(--foreground))' : '1px solid transparent',
      backgroundColor: isActive ? 'hsl(var(--foreground))' : 'transparent',
      color: isActive ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
      transition: 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
      boxShadow: isActive ? '0 1px 2px 0 hsl(0 0% 0% / 0.05)' : 'none',
      ...style,
    }}
    onMouseEnter={(e) => {
      if (!isActive) (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'hsl(var(--muted))';
    }}
    onMouseLeave={(e) => {
      if (!isActive) (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
    }}
    {...props}
  >
    {children}
  </a>
);
PaginationLink.displayName = "PaginationLink"

const PaginationPrevious = ({ className, ...props }: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink aria-label="Go to previous page" size="default" className={className}
    style={{ gap: 4, paddingLeft: 10 }} {...props}>
    <ChevronLeft style={{ width: 16, height: 16 }} />
    <span>Previous</span>
  </PaginationLink>
);
PaginationPrevious.displayName = "PaginationPrevious"

const PaginationNext = ({ className, ...props }: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink aria-label="Go to next page" size="default" className={className}
    style={{ gap: 4, paddingRight: 10 }} {...props}>
    <span>Next</span>
    <ChevronRight style={{ width: 16, height: 16 }} />
  </PaginationLink>
);
PaginationNext.displayName = "PaginationNext"

const PaginationEllipsis = ({ className, style, ...props }: React.ComponentProps<"span">) => (
  <span aria-hidden className={className}
    style={{ display: 'flex', height: 36, width: 36, alignItems: 'center', justifyContent: 'center', ...style }} {...props}>
    <MoreHorizontal style={{ width: 16, height: 16 }} />
    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>More pages</span>
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis"

export { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious }
