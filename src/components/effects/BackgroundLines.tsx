interface BackgroundLinesProps {
  className?: string;
  children?: React.ReactNode;
}

export function BackgroundLines({ children, className }: BackgroundLinesProps) {
  return <div className={className}>{children}</div>;
}
