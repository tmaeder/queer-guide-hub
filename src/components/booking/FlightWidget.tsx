import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plane } from 'lucide-react';

interface FlightWidgetProps {
  airportCode?: string;
  currency?: string;
  title?: string;
  className?: string;
}

export default function FlightWidget({ 
  airportCode, 
  currency = 'USD', 
  title = 'Flight Search',
  className = ''
}: FlightWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!airportCode || !widgetRef.current) return;

    // Determine currency based on location or default to USD
    const widgetCurrency = currency || 'USD';
    
    // Clear any existing content
    widgetRef.current.innerHTML = '';
    
    // Create script element
    const script = document.createElement('script');
    script.async = true;
    script.charset = 'utf-8';
    script.src = `https://tpscr.com/content?currency=${widgetCurrency}&trs=241762&shmarker=452012&locale=en&powered_by=false&to_name=${airportCode}&stops=0&limit=3&primary_color=000000ff&results_background_color=FFFFFF&form_background_color=FFFFFF&promo_id=4563&campaign_id=111`;
    
    // Add script to the widget container
    widgetRef.current.appendChild(script);
    
    // Cleanup function
    return () => {
      if (widgetRef.current) {
        widgetRef.current.innerHTML = '';
      }
    };
  }, [airportCode, currency]);

  if (!airportCode) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plane className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={widgetRef} className="min-h-[200px]" />
      </CardContent>
    </Card>
  );
}