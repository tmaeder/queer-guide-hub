import { Button } from 'queer-guide';
import { Heart, MapPin, Plus } from 'lucide-react';

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button>Plan a trip</Button>
    <Button variant="outline">View on map</Button>
    <Button variant="soft">Save for later</Button>
    <Button variant="ghost">Dismiss</Button>
    <Button variant="link">Read the full guide</Button>
    <Button variant="destructive">Delete trip</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button size="lg">Get started</Button>
    <Button size="default">Add to trip</Button>
    <Button size="sm">Filter</Button>
    <Button size="icon" aria-label="Save venue">
      <Heart />
    </Button>
  </div>
);

export const WithIcons = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button>
      <Plus /> Add venue
    </Button>
    <Button variant="outline">
      <MapPin /> Nearby
    </Button>
  </div>
);

export const States = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button disabled>Unavailable</Button>
    <Button loading>Saving…</Button>
    <Button variant="outline" disabled>
      Out of range
    </Button>
  </div>
);
