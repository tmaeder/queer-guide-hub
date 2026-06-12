import { ScrollArea, Badge } from 'queer-guide';

const venues = [
  ['SchwuZ', 'Club · Neukölln'],
  ['Silver Future', 'Bar · Neukölln'],
  ['Südblock', 'Café · Kreuzberg'],
  ['Möbel Olfe', 'Bar · Kreuzberg'],
  ['Tipsy Bear', 'Drag bar · Prenzlauer Berg'],
  ['Roses', 'Bar · Kreuzberg'],
  ['Berghain', 'Club · Friedrichshain'],
  ['Hafen', 'Bar · Schöneberg'],
  ['Tom’s Bar', 'Bar · Schöneberg'],
  ['Prinzknecht', 'Bar · Schöneberg'],
  ['Klub International', 'Club · Mitte'],
  ['Marais Berlin', 'Café · Schöneberg'],
  ['Heile Welt', 'Bar · Schöneberg'],
  ['Connection Club', 'Club · Schöneberg'],
];

export const VenueListScroll = () => (
  <ScrollArea
    type="always"
    className="h-64 w-80"
    style={{ border: '1px solid hsl(var(--border))', borderRadius: 8 }}
  >
    <div className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Queer venues — Berlin</h4>
      <ul className="divide-y divide-border">
        {venues.map(([name, kind]) => (
          <li key={name} className="flex items-center justify-between py-2">
            <span className="text-sm">{name}</span>
            <Badge variant="soft">{kind}</Badge>
          </li>
        ))}
      </ul>
    </div>
  </ScrollArea>
);
