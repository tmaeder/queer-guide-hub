import * as React from 'react';
import { cn } from '@/lib/utils';

interface CardContainer3DProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}

/**
 * Aceternity 3D card container — gutted 2026-05-19. 3D mouse-tilt removed.
 * Both the container and the CardItem are now flat divs.
 */
export function CardContainer3D({ children, className, containerClassName }: CardContainer3DProps) {
  return (
    <div className={cn(containerClassName)}>
      <div className={cn(className)}>{children}</div>
    </div>
  );
}

interface CardItemProps {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  translateZ?: number | string;
  rotateX?: number | string;
  rotateY?: number | string;
  rotateZ?: number | string;
}

export function CardItem({ children, className, as: Component = 'div' }: CardItemProps) {
  return <Component className={className}>{children}</Component>;
}
