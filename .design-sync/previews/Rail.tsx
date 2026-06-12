import {
  Rail,
  RailItem,
  Card,
  CardImage,
  CardHeader,
  CardTitle,
  CardDescription,
} from 'queer-guide';
import { StaticState } from './_static';

// Deterministic placeholder photo (no network in static capture).
const photo = (seed: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#e5e5e5"/><circle cx="${
      120 + seed.length * 30
    }" cy="100" r="44" fill="#d4d4d4"/><path d="M0 360 L200 ${
      140 + seed.length * 8
    } L380 300 L500 220 L640 360 Z" fill="#cfcfcf"/></svg>`,
  );

const cities = [
  { name: 'Berlin', sub: '128 venues · Equality 87' },
  { name: 'Madrid', sub: '96 venues · Equality 91' },
  { name: 'Bangkok', sub: '74 venues · Equality 79' },
  { name: 'Mexico City', sub: '88 venues · Equality 82' },
  { name: 'Taipei', sub: '52 venues · Equality 80' },
];

export const FeaturedCitiesRail = () => (
  <div className="px-4" style={{ width: 760 }}>
    <StaticState />
    <Rail title="City guides" subtitle="Where the community is heading this summer">
      {cities.map((c) => (
        <RailItem key={c.name} width="sm">
          <Card>
            <CardImage src={photo(c.name)} alt={`${c.name} skyline`} height={140} />
            <CardHeader>
              <CardTitle>{c.name}</CardTitle>
              <CardDescription>{c.sub}</CardDescription>
            </CardHeader>
          </Card>
        </RailItem>
      ))}
    </Rail>
  </div>
);
