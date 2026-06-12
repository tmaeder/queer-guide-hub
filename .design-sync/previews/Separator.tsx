import { Separator } from 'queer-guide';

export const Horizontal = () => (
  <div className="w-80">
    <div className="space-y-1">
      <h4 className="text-15 font-medium leading-none">Nightlife in Madrid</h4>
      <p className="text-13 text-muted-foreground">
        Bars, clubs and drag stages in Chueca.
      </p>
    </div>
    <Separator className="my-4" />
    <p className="text-13 text-muted-foreground">
      42 venues listed · last updated this week
    </p>
  </div>
);

export const VerticalNav = () => (
  <div className="flex h-5 items-center gap-4 text-13">
    <span>Venues</span>
    <Separator orientation="vertical" />
    <span>Events</span>
    <Separator orientation="vertical" />
    <span>Hotels</span>
    <Separator orientation="vertical" />
    <span className="text-muted-foreground">News</span>
  </div>
);

export const InList = () => (
  <div className="w-80 rounded-container border p-4">
    <p className="text-15 font-medium">Café Karanfil</p>
    <Separator className="my-2" />
    <p className="text-15 font-medium">Möbel Olfe</p>
    <Separator className="my-2" />
    <p className="text-15 font-medium">Silver Future</p>
  </div>
);
