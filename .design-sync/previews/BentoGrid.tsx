import { BentoGrid, BentoCell, Badge, Button } from 'queer-guide';
import { ArrowRight } from 'lucide-react';

export const CityStatsBento = () => (
  <div className="w-[720px]">
    <BentoGrid className="border border-border">
      <BentoCell span={6} title="Equality Index">
        <p className="text-display font-semibold leading-none">87</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Berlin ranks in the top 10 European destinations for legal protections and
          everyday acceptance.
        </p>
      </BentoCell>
      <BentoCell span={3} title="Venues">
        <p className="text-headline font-semibold leading-none">128</p>
        <p className="mt-2 text-13 text-muted-foreground">Bars, clubs, cafés, saunas</p>
      </BentoCell>
      <BentoCell span={3} title="Events this month">
        <p className="text-headline font-semibold leading-none">42</p>
        <p className="mt-2 text-13 text-muted-foreground">Including CSD week</p>
      </BentoCell>
      <BentoCell span={4} title="Queer villages">
        <div className="flex flex-wrap gap-2">
          <Badge variant="soft">Schöneberg</Badge>
          <Badge variant="soft">Neukölln</Badge>
          <Badge variant="soft">Kreuzberg</Badge>
        </div>
      </BentoCell>
      <BentoCell span={4} title="Marriage equality">
        <p className="text-sm">
          Legal since 2017, including joint adoption for married couples.
        </p>
      </BentoCell>
      <BentoCell
        span={4}
        title="Plan a trip"
        interactive
        action={
          <Button variant="ghost" size="sm" aria-label="Open trip planner">
            <ArrowRight className="h-4 w-4" />
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Build a safety-checked itinerary around Pride week.
        </p>
      </BentoCell>
    </BentoGrid>
  </div>
);
