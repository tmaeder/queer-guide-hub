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

    // Create the GetYourGuide iframe widget
    const iframe = document.createElement('iframe');
    iframe.src = `https://widget.getyourguide.com/default/activities.frame?partner_id=AFCJS2I&placement=other&utm_medium=online_publisher&utm_source=partner&q=${encodeURIComponent(destination)}&cnt_code=${countryCode || ''}&currency=EUR&locale_code=en-US`;
    iframe.width = '100%';
    iframe.height = '400';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '8px';
    iframe.title = `Activities and tours in ${destination}`;

    containerRef.current.appendChild(iframe);

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
      className="min-h-[400px] w-full"
    >
      <div className="text-center text-muted-foreground py-16">
        <p>Loading activities...</p>
      </div>
    </div>
  );
}