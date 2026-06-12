import {
  Card,
  CardImage,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
} from 'queer-guide';
import { StaticState } from './_static';

// Deterministic placeholder photo (no network in static capture).
const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#e5e5e5"/><circle cx="500" cy="110" r="48" fill="#d4d4d4"/><path d="M0 400 L220 180 L360 320 L460 230 L640 400 Z" fill="#cfcfcf"/></svg>`,
  );

export const VenueCard = () => (
  <Card className="w-80">
    <StaticState />
    <CardImage src={PHOTO} alt="SchwuZ queer club Berlin" height={180} />
    <CardHeader>
      <CardTitle>SchwuZ</CardTitle>
      <CardDescription>Queer club · Neukölln, Berlin</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-wrap gap-2">
        <Badge variant="soft">Club</Badge>
        <Badge variant="soft">Drag shows</Badge>
        <Badge variant="outline">Queer-owned</Badge>
      </div>
    </CardContent>
    <CardFooter>
      <Button variant="outline" size="sm">
        View venue
      </Button>
    </CardFooter>
  </Card>
);

export const TextCard = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Marriage equality</CardTitle>
      <CardDescription>Legal since 2017</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-15 text-muted-foreground">
        Same-sex marriage is fully recognized in Germany, including joint
        adoption rights for married couples.
      </p>
    </CardContent>
  </Card>
);
