import { useRef } from 'react';
import { toPng } from 'html-to-image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export interface YearReviewData {
  year: number;
  countries: number;
  topCity: string | null;
  venues: number;
  events: number;
}

export function YearInReview({ data }: { data: YearReviewData }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  const handleShare = async () => {
    const text = `${data.year}: ${data.countries} countries, ${data.venues} venues, ${data.events} events${
      data.topCity ? `, top destination ${data.topCity}` : ''
    } — queer.guide footprint`;
    try {
      if (ref.current) {
        const dataUrl = await toPng(ref.current, { cacheBust: true, pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = `footprint-${data.year}.png`;
        link.href = dataUrl;
        link.click();
        toast({ title: 'Image downloaded' });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied to clipboard' });
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: 'Copied to clipboard' });
      } catch {
        /* noop */
      }
    }
  };

  return (
    <Card data-testid="footprint-year-in-review">
      <CardHeader>
        <CardTitle className="text-base">Year in review: {data.year}</CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={ref} className="bg-background border border-border p-6 space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">queer.guide</div>
          <div className="text-3xl font-semibold">{data.year}</div>
          <div className="text-sm">Countries visited: {data.countries}</div>
          <div className="text-sm">Venues visited: {data.venues}</div>
          <div className="text-sm">Events attended: {data.events}</div>
          {data.topCity && <div className="text-sm">Top destination: {data.topCity}</div>}
        </div>
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={handleShare}>
            Share
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
