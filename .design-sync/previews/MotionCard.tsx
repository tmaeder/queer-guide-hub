import { MotionCard, Badge } from 'queer-guide';
import { MapPin, CalendarDays } from 'lucide-react';
import { StaticState } from './_static';

export const VenueTeaser = () => (
  <MotionCard className="w-80 p-6">
    <StaticState />
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-title font-semibold">Eagle Amsterdam</h3>
        <p className="mt-1 flex items-center gap-1 text-13 text-muted-foreground">
          <MapPin className="h-4 w-4" /> Warmoesstraat 90, Centrum
        </p>
      </div>
      <Badge variant="outline">Bar</Badge>
    </div>
    <p className="mt-4 text-15 text-muted-foreground">
      Cruise bar with three floors, open late on weekends. Cash only at the
      downstairs bar.
    </p>
  </MotionCard>
);

export const EventRow = () => (
  <div className="max-w-md space-y-4">
    <StaticState />
    {[
      { title: 'Queer Open Mic', meta: 'Thu 20:00 · De Trut' },
      { title: 'Milkshake Festival warm-up', meta: 'Fri 22:00 · Paradiso' },
    ].map((e) => (
      <MotionCard key={e.title} className="flex items-center gap-4 p-4">
        <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-15 font-medium">{e.title}</p>
          <p className="text-13 text-muted-foreground">{e.meta}</p>
        </div>
      </MotionCard>
    ))}
  </div>
);

export const StatTiles = () => (
  <div className="grid max-w-md grid-cols-2 gap-4">
    <StaticState />
    {[
      { label: 'Venues listed', value: '1,204' },
      { label: 'Cities covered', value: '386' },
      { label: 'Events this month', value: '92' },
      { label: 'Community notes', value: '5,318' },
    ].map((s) => (
      <MotionCard key={s.label} className="p-4">
        <p className="text-headline font-semibold">{s.value}</p>
        <p className="mt-1 text-13 text-muted-foreground">{s.label}</p>
      </MotionCard>
    ))}
  </div>
);
