import { useEffect, useRef } from 'react';

interface ActivitiesWidgetProps {
  destination: string;
  countryCode?: string;
}

export function ActivitiesWidget({ destination, countryCode }: ActivitiesWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !destination) return;

    // Clear any existing content
    containerRef.current.innerHTML = '';

    // Create GetYourGuide widget
    const widget = document.createElement('div');
    widget.className = 'gyg-widget';
    widget.setAttribute('data-gyg-href', `https://widget.getyourguide.com/default/activities.frame?partner_id=AFCJS2I&placement=other&utm_medium=online_publisher&utm_source=partner&q=${encodeURIComponent(destination)}&cnt_code=${countryCode || ''}&currency=EUR&locale_code=en-US`);
    widget.setAttribute('data-gyg-locale-code', 'en-US');
    widget.setAttribute('data-gyg-currency', 'EUR');
    widget.setAttribute('data-gyg-number-of-items', '6');
    widget.setAttribute('data-gyg-partner-id', 'AFCJS2I');
    
    // Add widget styles
    widget.style.width = '100%';
    widget.style.minHeight = '400px';

    containerRef.current.appendChild(widget);

    // Load GetYourGuide widget script
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://widget.getyourguide.com/dist/pa.umd.production.min.js';
    script.setAttribute('data-gyg-partner-id', 'AFCJS2I');
    
    document.head.appendChild(script);

    // Cleanup function
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [destination, countryCode]);

  return (
    <div 
      ref={containerRef} 
      className="min-h-[400px] w-full flex items-center justify-center"
    >
      <div className="text-center text-muted-foreground">
        <p>Loading activities...</p>
      </div>
    </div>
  );
}