import { Badge } from 'queer-guide';

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Verified venue</Badge>
    <Badge variant="outline">Pride 2026</Badge>
    <Badge variant="soft">Queer-owned</Badge>
    <Badge variant="destructive">Closed</Badge>
  </div>
);

export const MetadataRow = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="soft">Bar</Badge>
    <Badge variant="soft">Berlin</Badge>
    <Badge variant="soft">Wheelchair accessible</Badge>
    <Badge variant="outline">Trans-friendly</Badge>
  </div>
);
