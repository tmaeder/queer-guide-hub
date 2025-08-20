import { useState, useEffect } from 'react';

interface ScreenSize {
  width: number;
  height: number;
  lessThan: (breakpoint: string) => boolean;
}

const useScreenSize = (): ScreenSize => {
  const [screenSize, setScreenSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const lessThan = (breakpoint: string): boolean => {
    const breakpoints = {
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
    };
    
    return screenSize.width < (breakpoints[breakpoint as keyof typeof breakpoints] || 0);
  };

  return {
    ...screenSize,
    lessThan,
  };
};

export default useScreenSize;