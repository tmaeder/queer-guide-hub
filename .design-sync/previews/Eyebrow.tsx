import { Eyebrow } from 'queer-guide';

export const OverHeadline = () => (
  <div className="max-w-md space-y-2">
    <Eyebrow>City guide</Eyebrow>
    <h2 className="text-headline font-semibold leading-tight">
      Queer Lisbon, neighborhood by neighborhood
    </h2>
    <p className="text-15 text-muted-foreground">
      Príncipe Real has carried the city's queer nightlife since the 1980s.
    </p>
  </div>
);

export const SectionLabel = () => (
  <div className="w-80 space-y-2">
    <Eyebrow as="p">Upcoming events</Eyebrow>
    <ul className="space-y-1 text-15">
      <li>Drag Brunch · Sunday 11:00</li>
      <li>Queer Tango · Tuesday 19:30</li>
    </ul>
  </div>
);

export const InCardMeta = () => (
  <div className="w-80 rounded-container border p-4">
    <Eyebrow className="mb-2">Safety briefing</Eyebrow>
    <p className="text-15">
      Same-sex relationships are legal; public attitudes in the capital are
      broadly accepting.
    </p>
  </div>
);
