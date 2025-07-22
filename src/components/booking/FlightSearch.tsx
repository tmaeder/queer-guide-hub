import { useEffect, useRef } from 'react';
import { Plane } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function FlightSearch() {
  const scriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scriptRef.current) {
      // Clear any existing content
      scriptRef.current.innerHTML = '';
      
      // Create and append the script element
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://tpscr.com/content?currency=usd&trs=241762&shmarker=452012&locale=en&powered_by=false&limit=4&primary_color=000000ff&results_background_color=FFFFFF00&form_background_color=FFFFFF&campaign_id=111&promo_id=3411';
      script.charset = 'utf-8';
      
      scriptRef.current.appendChild(script);
    }
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            Flight Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={scriptRef} />
        </CardContent>
      </Card>
    </div>
  );
}