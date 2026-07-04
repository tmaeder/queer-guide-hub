import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { List, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export interface TocHeading {
  id: string;
  text: string;
  level: number;
}

interface TagTableOfContentsProps {
  headings: TocHeading[];
}

export function TagTableOfContents({ headings }: TagTableOfContentsProps) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string>('');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
      setMobileOpen(false);
    }
  }, []);

  if (headings.length < 3) return null;

  const list = (
    <nav aria-label={t('resources.tagDetail.tableOfContents', 'Table of contents')}>
      <ul className="flex flex-col gap-0.5">
        {headings.map((h) => (
          <li key={h.id}>
            <button
              onClick={() => scrollTo(h.id)}
              className={`text-left w-full bg-transparent border-0 cursor-pointer p-1 text-sm transition-colors ${
                h.level === 3 ? 'pl-4' : ''
              } ${
                activeId === h.id
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <>
      {/* Desktop: static list */}
      <div className="hidden lg:block">
        <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
          {t('resources.tagDetail.tableOfContents', 'Contents')}
        </h3>
        {list}
      </div>

      {/* Mobile: collapsible */}
      <div className="lg:hidden">
        <Collapsible open={mobileOpen} onOpenChange={setMobileOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium bg-transparent border-0 cursor-pointer p-0 text-muted-foreground hover:text-foreground">
            <List size={14} />
            {t('resources.tagDetail.tableOfContents', 'Contents')}
            <ChevronDown
              size={14}
              className="transition-transform"
              style={{ transform: mobileOpen ? 'rotate(180deg)' : undefined }}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 border-l pl-2">
            {list}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </>
  );
}
