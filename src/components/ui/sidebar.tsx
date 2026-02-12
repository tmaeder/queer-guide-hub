import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { PanelLeft } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const SIDEBAR_COOKIE_NAME = "sidebar:state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContext = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContext | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const isMobile = useIsMobile()
    const [openMobile, setOpenMobile] = React.useState(false)

    const [_open, _setOpen] = React.useState(defaultOpen)
    const open = openProp ?? _open
    const setOpen = React.useCallback(
      (value: boolean | ((value: boolean) => boolean)) => {
        const openState = typeof value === "function" ? value(open) : value
        if (setOpenProp) {
          setOpenProp(openState)
        } else {
          _setOpen(openState)
        }

        document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
      },
      [setOpenProp, open]
    )

    const toggleSidebar = React.useCallback(() => {
      return isMobile
        ? setOpenMobile((open) => !open)
        : setOpen((open) => !open)
    }, [isMobile, setOpen, setOpenMobile])

    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (
          event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault()
          toggleSidebar()
        }
      }

      window.addEventListener("keydown", handleKeyDown)
      return () => window.removeEventListener("keydown", handleKeyDown)
    }, [toggleSidebar])

    const state = open ? "expanded" : "collapsed"

    const contextValue = React.useMemo<SidebarContext>(
      () => ({
        state,
        open,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }),
      [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
    )

    return (
      <SidebarContext.Provider value={contextValue}>
        <TooltipProvider delayDuration={0}>
          <div
            style={{
              ["--sidebar-width" as string]: SIDEBAR_WIDTH,
              ["--sidebar-width-icon" as string]: SIDEBAR_WIDTH_ICON,
              display: 'flex',
              minHeight: '100svh',
              width: '100%',
              ...style,
            }}
            ref={ref}
            {...props}
          >
            {children}
          </div>
        </TooltipProvider>
      </SidebarContext.Provider>
    )
  }
)
SidebarProvider.displayName = "SidebarProvider"

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right"
    variant?: "sidebar" | "floating" | "inset"
    collapsible?: "offcanvas" | "icon" | "none"
  }
>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "offcanvas",
      children,
      ...props
    },
    ref
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

    if (collapsible === "none") {
      return (
        <div
          style={{
            display: 'flex',
            height: '100%',
            width: 'var(--sidebar-width)',
            flexDirection: 'column',
            backgroundColor: '#ffffff',
          }}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      )
    }

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <SheetContent
            data-sidebar="sidebar"
            data-mobile="true"
            style={{
              width: 'var(--sidebar-width)',
              ["--sidebar-width" as string]: SIDEBAR_WIDTH_MOBILE,
              backgroundColor: '#ffffff',
              padding: 0,
            }}
            side={side}
          >
            <div style={{ display: 'flex', height: '100%', width: '100%', flexDirection: 'column' }}>{children}</div>
          </SheetContent>
        </Sheet>
      )
    }

    return (
      <div
        ref={ref}
        style={{ display: 'none' }}
        data-state={state}
        data-collapsible={state === "collapsed" ? collapsible : ""}
        data-variant={variant}
        data-side={side}
      >
        {/* Sidebar gap on desktop */}
        <div
          style={{
            position: 'relative',
            height: '100svh',
            width: state === "collapsed" && collapsible === "offcanvas" ? 0
              : state === "collapsed" && collapsible === "icon" ? 'var(--sidebar-width-icon)'
              : 'var(--sidebar-width)',
            backgroundColor: 'transparent',
            transition: 'width 0.2s ease-in-out',
          }}
        />
        <div
          style={{
            position: 'fixed',
            insetBlock: 0,
            zIndex: 10,
            display: 'flex',
            height: '100svh',
            width: state === "collapsed" && collapsible === "icon" ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)',
            transition: 'left 0.2s ease-in-out, right 0.2s ease-in-out, width 0.2s ease-in-out',
            ...(side === "left" ? {
              left: state === "collapsed" && collapsible === "offcanvas" ? 'calc(var(--sidebar-width) * -1)' : 0,
              borderRight: variant === "sidebar" ? '1px solid #e5e5e5' : undefined,
            } : {
              right: state === "collapsed" && collapsible === "offcanvas" ? 'calc(var(--sidebar-width) * -1)' : 0,
              borderLeft: variant === "sidebar" ? '1px solid #e5e5e5' : undefined,
            }),
            ...(variant === "floating" || variant === "inset" ? { padding: 8 } : {}),
          }}
          {...props}
        >
          <div
            data-sidebar="sidebar"
            style={{
              display: 'flex',
              height: '100%',
              width: '100%',
              flexDirection: 'column',
              backgroundColor: '#ffffff',
              ...(variant === "floating" ? {
                borderRadius: 8,
                border: '1px solid #e5e5e5',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              } : {}),
            }}
          >
            {children}
          </div>
        </div>
        <style>{`
          @media (min-width: 768px) {
            [data-state] { display: block; }
            [data-state] > div:last-child { display: flex; }
          }
        `}</style>
      </div>
    )
  }
)
Sidebar.displayName = "Sidebar"

const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      style={{ height: 28, width: 28 }}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeft />
      <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }}>Toggle Sidebar</span>
    </Button>
  )
})
SidebarTrigger.displayName = "SidebarTrigger"

const SidebarRail = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ style, ...props }, ref) => {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      ref={ref}
      data-sidebar="rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      style={{
        position: 'absolute',
        insetBlock: 0,
        zIndex: 20,
        width: 16,
        transform: 'translateX(-50%)',
        transition: 'all 0.2s ease-in-out',
        background: 'transparent',
        border: 'none',
        cursor: 'col-resize',
        ...style,
      }}
      {...props}
    />
  )
})
SidebarRail.displayName = "SidebarRail"

const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"main">
>(({ style, ...props }, ref) => {
  return (
    <main
      ref={ref}
      style={{
        position: 'relative',
        display: 'flex',
        minHeight: '100svh',
        flex: 1,
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        ...style,
      }}
      {...props}
    />
  )
})
SidebarInset.displayName = "SidebarInset"

const SidebarInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentProps<typeof Input>
>(({ style, ...props }, ref) => {
  return (
    <Input
      ref={ref}
      data-sidebar="input"
      style={{
        height: 32,
        width: '100%',
        backgroundColor: '#ffffff',
        boxShadow: 'none',
        ...style,
      }}
      {...props}
    />
  )
})
SidebarInput.displayName = "SidebarInput"

const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ style, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="header"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, ...style }}
      {...props}
    />
  )
})
SidebarHeader.displayName = "SidebarHeader"

const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ style, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="footer"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, ...style }}
      {...props}
    />
  )
})
SidebarFooter.displayName = "SidebarFooter"

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentProps<typeof Separator>
>(({ style, ...props }, ref) => {
  return (
    <Separator
      ref={ref}
      data-sidebar="separator"
      style={{ marginLeft: 8, marginRight: 8, width: 'auto', ...style }}
      {...props}
    />
  )
})
SidebarSeparator.displayName = "SidebarSeparator"

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ style, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="content"
      style={{
        display: 'flex',
        minHeight: 0,
        flex: 1,
        flexDirection: 'column',
        gap: 8,
        overflowY: 'auto',
        ...style,
      }}
      {...props}
    />
  )
})
SidebarContent.displayName = "SidebarContent"

const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ style, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="group"
      style={{ position: 'relative', display: 'flex', width: '100%', minWidth: 0, flexDirection: 'column', padding: 8, ...style }}
      {...props}
    />
  )
})
SidebarGroup.displayName = "SidebarGroup"

const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { asChild?: boolean }
>(({ asChild = false, style, ...props }, ref) => {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      ref={ref}
      data-sidebar="group-label"
      style={{
        display: 'flex',
        height: 32,
        flexShrink: 0,
        alignItems: 'center',
        borderRadius: 6,
        paddingLeft: 8,
        paddingRight: 8,
        fontSize: '0.75rem',
        fontWeight: 500,
        color: 'rgba(0,0,0,0.5)',
        outline: 'none',
        transition: 'margin 0.2s ease-in-out, opacity 0.2s ease-in-out',
        ...style,
      }}
      {...props}
    />
  )
})
SidebarGroupLabel.displayName = "SidebarGroupLabel"

const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { asChild?: boolean }
>(({ asChild = false, style, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-sidebar="group-action"
      style={{
        position: 'absolute',
        right: 12,
        top: 14,
        display: 'flex',
        aspectRatio: '1/1',
        width: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        padding: 0,
        color: '#333333',
        outline: 'none',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        ...style,
      }}
      {...props}
    />
  )
})
SidebarGroupAction.displayName = "SidebarGroupAction"

const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ style, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-content"
    style={{ width: '100%', fontSize: '0.875rem', ...style }}
    {...props}
  />
))
SidebarGroupContent.displayName = "SidebarGroupContent"

const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ style, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    style={{ display: 'flex', width: '100%', minWidth: 0, flexDirection: 'column', gap: 4, listStyle: 'none', margin: 0, padding: 0, ...style }}
    {...props}
  />
))
SidebarMenu.displayName = "SidebarMenu"

const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ style, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    style={{ position: 'relative', ...style }}
    {...props}
  />
))
SidebarMenuItem.displayName = "SidebarMenuItem"

interface SidebarMenuButtonProps extends React.ComponentProps<"button"> {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
}

const sizeHeights: Record<string, number> = { default: 32, sm: 28, lg: 48 }

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  (
    {
      asChild = false,
      isActive = false,
      variant = "default",
      size = "default",
      tooltip,
      style,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    const { isMobile, state } = useSidebar()

    const button = (
      <Comp
        ref={ref}
        data-sidebar="menu-button"
        data-size={size}
        data-active={isActive}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          gap: 8,
          overflow: 'hidden',
          borderRadius: 6,
          padding: 8,
          textAlign: 'left',
          fontSize: size === 'sm' ? '0.75rem' : '0.875rem',
          outline: 'none',
          border: 'none',
          background: isActive ? '#f5f5f5' : 'transparent',
          fontWeight: isActive ? 500 : 400,
          cursor: 'pointer',
          height: sizeHeights[size],
          transition: 'width 0.2s, height 0.2s, padding 0.2s',
          ...(variant === "outline" ? {
            boxShadow: '0 0 0 1px #e5e5e5',
          } : {}),
          ...style,
        }}
        {...props}
      />
    )

    if (!tooltip) {
      return button
    }

    if (typeof tooltip === "string") {
      tooltip = {
        children: tooltip,
      }
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          hidden={state !== "collapsed" || isMobile}
          {...tooltip}
        />
      </Tooltip>
    )
  }
)
SidebarMenuButton.displayName = "SidebarMenuButton"

const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean
    showOnHover?: boolean
  }
>(({ asChild = false, showOnHover = false, style, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-action"
      style={{
        position: 'absolute',
        right: 4,
        top: 6,
        display: 'flex',
        aspectRatio: '1/1',
        width: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        padding: 0,
        color: '#333333',
        outline: 'none',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        ...(showOnHover ? { opacity: 0 } : {}),
        ...style,
      }}
      {...props}
    />
  )
})
SidebarMenuAction.displayName = "SidebarMenuAction"

const SidebarMenuBadge = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ style, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="menu-badge"
    style={{
      position: 'absolute',
      right: 4,
      display: 'flex',
      height: 20,
      minWidth: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      paddingLeft: 4,
      paddingRight: 4,
      fontSize: '0.75rem',
      fontWeight: 500,
      fontVariantNumeric: 'tabular-nums',
      color: '#333333',
      userSelect: 'none',
      pointerEvents: 'none',
      ...style,
    }}
    {...props}
  />
))
SidebarMenuBadge.displayName = "SidebarMenuBadge"

const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    showIcon?: boolean
  }
>(({ showIcon = false, style, ...props }, ref) => {
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  }, [])

  return (
    <div
      ref={ref}
      data-sidebar="menu-skeleton"
      style={{ borderRadius: 6, height: 32, display: 'flex', gap: 8, paddingLeft: 8, paddingRight: 8, alignItems: 'center', ...style }}
      {...props}
    >
      {showIcon && (
        <Skeleton
          style={{ height: 16, width: 16, borderRadius: 6 }}
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        style={{ height: 16, flex: 1, maxWidth: width }}
        data-sidebar="menu-skeleton-text"
      />
    </div>
  )
})
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton"

const SidebarMenuSub = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ style, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu-sub"
    style={{
      marginLeft: 14,
      display: 'flex',
      minWidth: 0,
      transform: 'translateX(1px)',
      flexDirection: 'column',
      gap: 4,
      borderLeft: '1px solid #e5e5e5',
      paddingLeft: 10,
      paddingRight: 10,
      paddingTop: 2,
      paddingBottom: 2,
      listStyle: 'none',
      margin: 0,
      marginLeft: 14,
      ...style,
    }}
    {...props}
  />
))
SidebarMenuSub.displayName = "SidebarMenuSub"

const SidebarMenuSubItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ ...props }, ref) => <li ref={ref} {...props} />)
SidebarMenuSubItem.displayName = "SidebarMenuSubItem"

const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<"a"> & {
    asChild?: boolean
    size?: "sm" | "md"
    isActive?: boolean
  }
>(({ asChild = false, size = "md", isActive, style, ...props }, ref) => {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      style={{
        display: 'flex',
        height: 28,
        minWidth: 0,
        transform: 'translateX(-1px)',
        alignItems: 'center',
        gap: 8,
        overflow: 'hidden',
        borderRadius: 6,
        paddingLeft: 8,
        paddingRight: 8,
        color: '#333333',
        outline: 'none',
        fontSize: size === 'sm' ? '0.75rem' : '0.875rem',
        textDecoration: 'none',
        ...(isActive ? { backgroundColor: '#f5f5f5', fontWeight: 500 } : {}),
        ...style,
      }}
      {...props}
    />
  )
})
SidebarMenuSubButton.displayName = "SidebarMenuSubButton"

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
