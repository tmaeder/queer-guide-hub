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
      borderRadius: 0, fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
      textDecoration: 'none', color: 'inherit',
      minWidth: size === "icon" ? 36 : undefined, height: 36,
      padding: size === "icon" ? 0 : '0 16px',
      border: 'none',
      backgroundColor: isActive ? 'var(--background, #fff)' : 'transparent',
      ...style,
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
