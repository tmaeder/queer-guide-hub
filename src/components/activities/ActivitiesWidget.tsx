import { useEffect, useRef } from 'react';

interface ActivitiesWidgetProps {
  destination: string;
  countryCode?: string;
}

export function ActivitiesWidget({ destination, countryCode }: ActivitiesWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load GetYourGuide script if not already loaded
    const existingScript = document.querySelector('script[data-gyg-partner-id="2PBDXWH"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.src = 'https://widget.getyourguide.com/dist/pa.umd.production.min.js';
      script.setAttribute('data-gyg-partner-id', '2PBDXWH');
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div className="min-h-[400px] w-full">
      <div 
        ref={containerRef}
        data-gyg-widget="auto" 
        data-gyg-partner-id="2PBDXWH"
        className="w-full min-h-[400px]"
      />
    </div>
  );
}