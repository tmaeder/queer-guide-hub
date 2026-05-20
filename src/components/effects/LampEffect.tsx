interface LampEffectProps {
  className?: string;
  children?: React.ReactNode;
}

export function LampEffect({ children, className }: LampEffectProps) {
  return <div className={className}>{children}</div>;
}
