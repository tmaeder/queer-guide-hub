import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plane, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FlightWidgetProps {
  airportCode?: string;
  currency?: string;
  title?: string;
  className?: string;
  cityName?: string;
  countryName?: string;
}

export default function FlightWidget({ 
  airportCode, 
  currency = 'USD', 
  title = 'Flight Search',
  className = '',
  cityName,
  countryName
}: FlightWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!airportCode || !widgetRef.current) {
      setIsLoading(false);
      return;
    }

    // Reset states
    setIsLoading(true);
    setHasError(false);
    
    // Clear any existing content
    widgetRef.current.innerHTML = '';
    
    // Create script element with better error handling
    const script = document.createElement('script');
    script.async = true;
    script.charset = 'utf-8';
    script.src = `https://tpscr.com/content?currency=${currency}&trs=241762&shmarker=452012&locale=en&powered_by=false&to_name=${airportCode}&stops=0&limit=3&primary_color=000000ff&results_background_color=FFFFFF&form_background_color=FFFFFF&promo_id=4563&campaign_id=111`;
    
    // Add error handling
    script.onerror = () => {
      setHasError(true);
      setIsLoading(false);
    };
    
    script.onload = () => {
      setIsLoading(false);
    };
    
    // Add script to the widget container
    widgetRef.current.appendChild(script);
    
    // Set a timeout to handle cases where the widget doesn't load
    const timeout = setTimeout(() => {
      setIsLoading(false);
    }, 5000);
    
    // Cleanup function
    return () => {
      clearTimeout(timeout);
      if (widgetRef.current) {
        widgetRef.current.innerHTML = '';
      }
    };
  }, [airportCode, currency]);

  const locationName = cityName || countryName || 'this location';
  const searchQuery = cityName ? `${cityName} ${countryName}` : countryName;

  if (!airportCode) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
            <div 
              ref={widgetRef}
              dangerouslySetInnerHTML={{
                __html: `<script async src="https://tpscr.com/content?currency=usd&trs=241762&shmarker=452012&locale=en&powered_by=false&to_name=${airportCode || 'BER'}&limit=4&primary_color=FFFFFF00&results_background_color=FFFFFF00&form_background_color=FFFFFF00&promo_id=4563&campaign_id=111" charset="utf-8"></script>`
              }}
              className="min-h-[300px]"
            />
        </CardContent>
      </Card>
    );
  }

  if (hasError) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
            <div 
              dangerouslySetInnerHTML={{
                __html: `<script async src="https://tpscr.com/content?currency=usd&trs=241762&shmarker=452012&powered_by=false&locale=en&to_name=${airportCode || 'LHR'}&show_header=true&limit=2&primary_color=FFFFFF00&results_background_color=FFFFFF00&form_background_color=FFFFFF00&campaign_id=111&promo_id=4478" charset="utf-8"></script>`
              }}
              className="min-h-[300px]"
            />
        </CardContent>
      </Card>
    );
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
        {isLoading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading flight search...</p>
          </div>
        )}
        <div 
          dangerouslySetInnerHTML={{
            __html: `<script async src="https://tpscr.com/content?currency=usd&trs=241762&shmarker=452012&powered_by=false&locale=en&to_name=${airportCode || 'LHR'}&show_header=true&limit=2&primary_color=FFFFFF00&results_background_color=FFFFFF00&form_background_color=FFFFFF00&campaign_id=111&promo_id=4478" charset="utf-8"></script>`
          }}
          className="min-h-[200px]"
        />
      </CardContent>
    </Card>
  );
}