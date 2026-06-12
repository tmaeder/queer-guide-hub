import { Alert, AlertTitle, AlertDescription } from 'queer-guide';
import { Info, ShieldAlert, CalendarClock } from 'lucide-react';

export const Default = () => (
  <Alert className="max-w-md">
    <Info className="h-4 w-4" />
    <AlertTitle>Pride week schedule</AlertTitle>
    <AlertDescription>
      Many venues extend opening hours during Berlin Pride, July 19–27. Check
      individual listings before heading out.
    </AlertDescription>
  </Alert>
);

export const Destructive = () => (
  <Alert variant="destructive" className="max-w-md">
    <ShieldAlert className="h-4 w-4" />
    <AlertTitle>Event cancelled</AlertTitle>
    <AlertDescription>
      Queer Film Night at Kino International was cancelled by the organizer.
      Ticket holders are being refunded.
    </AlertDescription>
  </Alert>
);

export const DescriptionOnly = () => (
  <Alert className="max-w-md">
    <CalendarClock className="h-4 w-4" />
    <AlertDescription>
      Opening hours were last verified 3 weeks ago and may have changed.
    </AlertDescription>
  </Alert>
);
