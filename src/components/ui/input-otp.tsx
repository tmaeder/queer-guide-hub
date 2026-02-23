import * as React from "react"
import { OTPInput, OTPInputContext } from "input-otp"
import { Dot } from "lucide-react"

const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput>
>(({ className, containerClassName, ...props }, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={containerClassName}
    className={className}
    style={{ cursor: props.disabled ? 'not-allowed' : undefined }}
    {...props}
  />
))
InputOTP.displayName = "InputOTP"

const InputOTPGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ style, ...props }, ref) => (
  <div
    ref={ref}
    style={{ display: 'flex', alignItems: 'center', ...style }}
    {...props}
  />
))
InputOTPGroup.displayName = "InputOTPGroup"

const InputOTPSlot = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & { index: number }
>(({ index, style, ...props }, ref) => {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext.slots[index]

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        display: 'flex',
        height: 40,
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderTop: '1px solid #e5e5e5',
        borderBottom: '1px solid #e5e5e5',
        borderRight: '1px solid #e5e5e5',
        fontSize: '0.875rem',
        transition: 'all 0.15s',
        ...(isActive ? {
          zIndex: 10,
          boxShadow: '0 0 0 2px currentColor',
        } : {}),
        ...style,
      }}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div style={{
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            height: 16,
            width: 1,
            backgroundColor: 'currentColor',
            animation: 'caretBlink 1s step-end infinite',
          }} />
        </div>
      )}
      <style>{`
        @keyframes caretBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
})
InputOTPSlot.displayName = "InputOTPSlot"

const InputOTPSeparator = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ ...props }, ref) => (
  <div ref={ref} role="separator" {...props}>
    <Dot />
  </div>
))
InputOTPSeparator.displayName = "InputOTPSeparator"

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
