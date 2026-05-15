import { Activity, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GYG_PARTNER_ID = '2PBDXWH';

interface ActivitiesWidgetProps {
  destination: string;
  countryCode?: string;
}

export function ActivitiesWidget({ destination }: ActivitiesWidgetProps) {
  const searchUrl = `https://www.getyourguide.com/s/?q=${encodeURIComponent(destination + ' LGBTQ')}&partner_id=${GYG_PARTNER_ID}`;

  return (
    <div className="text-center py-12 px-6 bg-muted/40 rounded-container border-2 border-dashed border-border">
      <div className="p-4 bg-muted rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
        <Activity className="h-8 w-8 text-muted-foreground" />
      </div>
      <h6 className="text-base font-semibold mb-1">Tours & Activities</h6>
      <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
        Discover amazing experiences in {destination}. Browse tours, activities, and attractions.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.open(searchUrl, '_blank', 'noopener,noreferrer')}
      >
        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
        Browse Tours on GetYourGuide
      </Button>
    </div>
  );
}
