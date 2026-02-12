import * as React from "react"
import { ChevronDown } from "lucide-react"

const navigationMenuTriggerStyle = () => "";

const NavigationMenu = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, children, style, ...props }, ref) => (
    <nav ref={ref} className={className}
      style={{ position: 'relative', zIndex: 10, display: 'flex', maxWidth: 'max-content', flex: 1, alignItems: 'center', justifyContent: 'center', ...style }} {...props}>
      {children}
    </nav>
  )
);
NavigationMenu.displayName = "NavigationMenu"

const NavigationMenuList = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, style, ...props }, ref) => (
    <ul ref={ref} className={className}
      style={{ display: 'flex', flex: 1, listStyle: 'none', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 0, margin: 0, ...style }} {...props} />
  )
);
NavigationMenuList.displayName = "NavigationMenuList"

const NavigationMenuItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  (props, ref) => <li ref={ref} {...props} />
);
NavigationMenuItem.displayName = "NavigationMenuItem"

const NavigationMenuTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, style, ...props }, ref) => (
    <button ref={ref} className={className}
      style={{ display: 'inline-flex', height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, padding: '8px 16px', fontSize: '0.875rem', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', ...style }} {...props}>
      {children}
      <ChevronDown style={{ width: 12, height: 12, marginLeft: 4, transition: 'transform 0.2s' }} aria-hidden="true" />
    </button>
  )
);
NavigationMenuTrigger.displayName = "NavigationMenuTrigger"

const NavigationMenuContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => <div ref={ref} className={className} style={style} {...props} />
);
NavigationMenuContent.displayName = "NavigationMenuContent"

const NavigationMenuLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(
  (props, ref) => <a ref={ref} {...props} />
);
NavigationMenuLink.displayName = "NavigationMenuLink"

const NavigationMenuViewport = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} {...props} />
);
NavigationMenuViewport.displayName = "NavigationMenuViewport"

const NavigationMenuIndicator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} {...props} />
);
NavigationMenuIndicator.displayName = "NavigationMenuIndicator"

export { navigationMenuTriggerStyle, NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuContent, NavigationMenuTrigger, NavigationMenuLink, NavigationMenuIndicator, NavigationMenuViewport }
