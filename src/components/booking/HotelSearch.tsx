import { useEffect, useRef } from 'react';
import { Hotel as HotelIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function HotelSearch() {
  const scriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scriptRef.current) {
      // Clear any existing content
      scriptRef.current.innerHTML = '';
      
      // Create and append the script element
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://tpscr.com/content?currency=usd&trs=241762&shmarker=452012&show_hotels=true&powered_by=false&locale=en&searchUrl=search.hotellook.com&primary_override=%23000000ff&color_button=%23000000ff&color_icons=%23000000ff&secondary=%23FFFFFF&dark=%23262626&light=%23FFFFFF&special=%23C4C4C4&color_focused=%23000000ff&border_radius=5&no_labels=true&plain=true&promo_id=7873&campaign_id=101';
      script.charset = 'utf-8';
      
      scriptRef.current.appendChild(script);
    }
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HotelIcon className="h-5 w-5" />
            Search Hotels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={scriptRef} />
        </CardContent>
      </Card>
    </div>
  );
}