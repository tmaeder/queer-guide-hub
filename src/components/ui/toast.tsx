import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { X } from "lucide-react"

const ToastProvider = ToastPrimitives.Provider

const toastViewportStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  right: 0,
  zIndex: 100,
  display: 'flex',
  maxHeight: '100vh',
  width: '100%',
  flexDirection: 'column',
  padding: 16,
  maxWidth: 420,
}

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ style, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    style={{ ...toastViewportStyle, ...style }}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

type ToastVariant = 'default' | 'destructive';

interface ToastProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> {
  variant?: ToastVariant;
}

const getToastStyle = (variant: ToastVariant = 'default'): React.CSSProperties => {
  const base: React.CSSProperties = {
    pointerEvents: 'auto',
    position: 'relative',
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    overflow: 'hidden',
    borderRadius: 8,
    padding: 24,
    paddingRight: 32,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e5e5',
  };

  if (variant === 'destructive') {
    return {
      ...base,
      backgroundColor: '#dc2626',
      color: '#ffffff',
      borderColor: '#dc2626',
    };
  }

  return {
    ...base,
    backgroundColor: '#ffffff',
    color: '#333333',
  };
};

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  ToastProps
>(({ variant = 'default', style, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      style={{ ...getToastStyle(variant), ...style }}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const toastActionStyle: React.CSSProperties = {
  display: 'inline-flex',
  height: 32,
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  backgroundColor: '#f5f5f5',
  padding: '0 12px',
  fontSize: '0.875rem',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
}

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ style, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    style={{ ...toastActionStyle, ...style }}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const toastCloseStyle: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  top: 8,
  borderRadius: 8,
  padding: 4,
  color: 'rgba(0, 0, 0, 0.5)',
  opacity: 0.7,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  transition: 'opacity 0.2s',
}

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ style, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    style={{ ...toastCloseStyle, ...style }}
    toast-close=""
    aria-label="Close notification"
    {...props}
  >
    <X style={{ height: 16, width: 16 }} />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const toastTitleStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 600,
}

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ style, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    style={{ ...toastTitleStyle, ...style }}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const toastDescriptionStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  opacity: 0.9,
}

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ style, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    style={{ ...toastDescriptionStyle, ...style }}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastPropsExport = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastPropsExport as ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
