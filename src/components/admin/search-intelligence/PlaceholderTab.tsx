import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderTabProps {
  title: string;
  description: string;
  bullets: string[];
}

export function PlaceholderTab({ title, description, bullets }: PlaceholderTabProps) {
  return (
    <Card>
      <CardContent>
        <h6 className="text-base font-semibold mb-2">{title}</h6>
        <p className="text-sm text-muted-foreground mb-2">{description}</p>
        <ul className="mt-4 list-disc list-inside">
          {bullets.map((b) => (
            <li key={b} className="text-sm">{b}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
