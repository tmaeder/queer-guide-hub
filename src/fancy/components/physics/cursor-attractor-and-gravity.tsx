import React, { useRef, useEffect, useState } from 'react';

interface GravityProps {
  children: React.ReactNode;
  attractorPoint?: { x: string; y: string };
  attractorStrength?: number;
  cursorStrength?: number;
  cursorFieldRadius?: number;
  className?: string;
}

interface MatterBodyProps {
  children: React.ReactNode;
  x?: string;
  y?: string;
  matterBodyOptions?: {
    friction?: number;
    restitution?: number;
  };
}

export const MatterBody: React.FC<MatterBodyProps> = ({ 
  children, 
  x = "50%", 
  y = "50%",
  matterBodyOptions = {},
  ...props 
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !element.parentElement) return;

    const parent = element.parentElement;
    const parentRect = parent.getBoundingClientRect();
    
    const initialX = (parseFloat(x.replace('%', '')) / 100) * parentRect.width;
    const initialY = (parseFloat(y.replace('%', '')) / 100) * parentRect.height;
    
    setPosition({ x: initialX, y: initialY });
  }, [x, y]);

  return (
    <div
      ref={elementRef}
      data-matter-body="true"
      {...props}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
        transition: 'all 0.1s ease-out',
      }}
    >
      {children}
    </div>
  );
};

const Gravity: React.FC<GravityProps> = ({
  children,
  attractorPoint = { x: "50%", y: "50%" },
  attractorStrength = 0.0006,
  cursorStrength = -0.005,
  cursorFieldRadius = 200,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const animationRef = useRef<number>();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    const animate = () => {
      const elements = container.querySelectorAll('[data-matter-body]');
      const containerRect = container.getBoundingClientRect();
      
      const attractorX = (parseFloat(attractorPoint.x.replace('%', '')) / 100) * containerRect.width;
      const attractorY = (parseFloat(attractorPoint.y.replace('%', '')) / 100) * containerRect.height;

      elements.forEach((element) => {
        const htmlElement = element as HTMLElement;
        const currentTransform = htmlElement.style.transform;
        const match = currentTransform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
        
        if (match) {
          const currentX = parseFloat(match[1]);
          const currentY = parseFloat(match[2]);
          
          // Calculate distance to cursor
          const distToCursor = Math.sqrt(
            Math.pow(mousePosition.x - currentX, 2) + 
            Math.pow(mousePosition.y - currentY, 2)
          );
          
          let forceX = 0;
          let forceY = 0;
          
          // Attractor force
          const attractorDx = attractorX - currentX;
          const attractorDy = attractorY - currentY;
          const attractorDist = Math.sqrt(attractorDx * attractorDx + attractorDy * attractorDy);
          
          if (attractorDist > 0) {
            forceX += (attractorDx / attractorDist) * attractorStrength * attractorDist;
            forceY += (attractorDy / attractorDist) * attractorStrength * attractorDist;
          }
          
          // Cursor repulsion
          if (distToCursor < cursorFieldRadius && distToCursor > 0) {
            const cursorDx = currentX - mousePosition.x;
            const cursorDy = currentY - mousePosition.y;
            const strength = (cursorFieldRadius - distToCursor) / cursorFieldRadius;
            
            forceX += (cursorDx / distToCursor) * cursorStrength * strength * 1000;
            forceY += (cursorDy / distToCursor) * cursorStrength * strength * 1000;
          }
          
          // Apply forces with damping
          const newX = currentX + forceX;
          const newY = currentY + forceY;
          
          htmlElement.style.transform = `translate(${newX}px, ${newY}px) translate(-50%, -50%)`;
        }
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };

    container.addEventListener('mousemove', handleMouseMove);
    animate();

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [attractorPoint, attractorStrength, cursorStrength, cursorFieldRadius, mousePosition]);

  return (
    <div ref={containerRef} style={{ position: 'relative', overflow: 'hidden' }} className={className}>
      {children}
    </div>
  );
};

export default Gravity;