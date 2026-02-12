import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { ChevronRight, MoreHorizontal } from "lucide-react"

const Breadcrumb = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<"nav"> & { separator?: React.ReactNode }>(
  ({ ...props }, ref) => <nav ref={ref} aria-label="breadcrumb" {...props} />
);
Breadcrumb.displayName = "Breadcrumb"

const BreadcrumbList = React.forwardRef<HTMLOListElement, React.ComponentPropsWithoutRef<"ol">>(
  ({ className, style, ...props }, ref) => (
    <ol
      ref={ref}
      className={className}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: '0.875rem', color: 'var(--muted-foreground, #666)', wordBreak: 'break-word', ...style }}
      {...props}
    />
  )
);
BreadcrumbList.displayName = "BreadcrumbList"

const BreadcrumbItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<"li">>(
  ({ className, style, ...props }, ref) => (
    <li ref={ref} className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }} {...props} />
  )
);
BreadcrumbItem.displayName = "BreadcrumbItem"

const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, React.ComponentPropsWithoutRef<"a"> & { asChild?: boolean }>(
  ({ asChild, className, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "a";
    return <Comp ref={ref} className={className} style={{ transition: 'color 0.15s', cursor: 'pointer', ...style }} {...props} />;
  }
);
BreadcrumbLink.displayName = "BreadcrumbLink"

const BreadcrumbPage = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<"span">>(
  ({ className, style, ...props }, ref) => (
    <span ref={ref} role="link" aria-disabled="true" aria-current="page" className={className} style={{ fontWeight: 400, ...style }} {...props} />
  )
);
BreadcrumbPage.displayName = "BreadcrumbPage"

const BreadcrumbSeparator = ({ children, className, style, ...props }: React.ComponentProps<"li">) => (
  <li role="presentation" aria-hidden="true" className={className} style={{ ...style }} {...props}>
    {children ?? <ChevronRight style={{ width: 14, height: 14 }} />}
  </li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator"

const BreadcrumbEllipsis = ({ className, style, ...props }: React.ComponentProps<"span">) => (
  <span role="presentation" aria-hidden="true" className={className}
    style={{ display: 'flex', height: 36, width: 36, alignItems: 'center', justifyContent: 'center', ...style }} {...props}>
    <MoreHorizontal style={{ width: 16, height: 16 }} />
    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>More</span>
  </span>
);
BreadcrumbEllipsis.displayName = "BreadcrumbEllipsis"

export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis }
