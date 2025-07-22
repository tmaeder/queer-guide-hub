import { useEffect, useRef } from 'react';
import { Car } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function CarRentalSearch() {
  const scriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scriptRef.current) {
      // Clear any existing content
      scriptRef.current.innerHTML = '';
      
      // Create and append the script element
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://tpscr.com/content?currency=usd&trs=241762&shmarker=452012&locale=en&powered_by=false&bg_color=%23FFFFFF00&font_color=%23333333&button_color=%23000000ff&button_font_color=%23ffffff&button_text=Search&rounded_corners=false&benefits=true&dc_powered_by=false&supplier_logos=false&campaign_id=117&promo_id=3873';
      script.charset = 'utf-8';
      
      scriptRef.current.appendChild(script);
    }
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Car Rental Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={scriptRef} />
        </CardContent>
      </Card>
    </div>
  );
}