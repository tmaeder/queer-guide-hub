import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";

interface HotelWidgetProps {
  latitude?: number;
  longitude?: number;
  title?: string;
  className?: string;
}

export default function HotelWidget({ 
  latitude, 
  longitude, 
  title = "Hotels",
  className 
}: HotelWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!latitude || !longitude || !widgetRef.current) {
      console.log('HotelWidget: Missing coordinates or ref', { latitude, longitude });
      return;
    }

    // Clear any existing content
    widgetRef.current.innerHTML = '';

    // Create script element
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://tpscr.com/content?currency=usd&trs=241762&shmarker=452012&search_host=search.hotellook.com&locale=en&powered_by=false&draggable=true&disable_zoom=false&show_logo=true&scrollwheel=false&color=%23000000ff&contrast_color=%23ffffff&width=1000&height=500&lat=${latitude}&lng=${longitude}&zoom=14&radius=60&stars=0&rating_from=0&rating_to=10&promo_id=4285&campaign_id=101`;
    script.charset = 'utf-8';

    // Handle script loading
    script.onload = () => {
      console.log('Hotel widget script loaded successfully');
    };

    script.onerror = (error) => {
      console.error('Failed to load hotel widget script:', error);
      if (widgetRef.current) {
        widgetRef.current.innerHTML = '<p class="text-muted-foreground text-center py-8">Unable to load hotel search widget</p>';
      }
    };

    // Append script to the widget container
    widgetRef.current.appendChild(script);

    // Cleanup function
    return () => {
      if (widgetRef.current) {
        widgetRef.current.innerHTML = '';
      }
    };
  }, [latitude, longitude]);

  if (!latitude || !longitude) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Location coordinates not available for hotel search
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div 
          ref={widgetRef}
          style={{ minHeight: '500px' }}
          className="w-full"
        />
      </CardContent>
    </Card>
  );
}