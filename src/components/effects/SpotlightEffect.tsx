interface SpotlightEffectProps {
  className?: string;
  children?: React.ReactNode;
  intensity?: number;
}

export function SpotlightEffect({ children, className }: SpotlightEffectProps) {
  return <div className={className}>{children}</div>;
}
