import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { StoryCard } from '@/components/news/StoryCard';
import { Separator } from '@/components/ui/separator';
import { Layers } from 'lucide-react';

type Story = {
  id: string;
  slug?: string | null;
  title: string;
  article_count: number;
  hero_article_id?: string | null;
};

type HeroArticle = Record<string, unknown>;

interface StoryCollectionsBandProps {
  stories: Story[];
  heroes: Record<string, HeroArticle>;
  limit?: number;
}

export function StoryCollectionsBand({
  stories,
  heroes,
  limit = 3,
}: StoryCollectionsBandProps) {
  const visible = stories.slice(0, limit);
  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="stories-band-heading" className="mb-16">
      <Separator className="mb-6" />
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-2">
            <Layers size={12} aria-hidden="true" />
            Story collections
          </p>
          <h2 className="m-0 text-display font-bold leading-none tracking-tight">
            Following the thread
          </h2>
          <p className="mt-2 text-15 italic text-muted-foreground max-w-xl leading-snug">
            Multi-article stories grouped by reporters and editors.
          </p>
        </div>
        <LocalizedLink
          to="/news/all?view=stories"
          className="text-13 uppercase tracking-wider whitespace-nowrap hover:underline no-underline text-foreground shrink-0"
        >
          All collections →
        </LocalizedLink>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visible.map((s) => (
          <StoryCard
            key={s.id}
            story={s as Parameters<typeof StoryCard>[0]['story']}
            hero={s.hero_article_id ? (heroes[s.hero_article_id] as Parameters<typeof StoryCard>[0]['hero']) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
