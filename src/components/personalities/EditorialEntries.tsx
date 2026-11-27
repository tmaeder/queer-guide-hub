import { personalityProfessionLabel } from '@/lib/professionDisplay';
import { useProfessionFacets } from '@/hooks/usePersonalities';
import { useBornThisWeek } from '@/hooks/useBornThisWeek';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  BookOpen,
  Briefcase,
  Cake,
  Camera,
  Film,
  FlaskConical,
  Flower2,
  GraduationCap,
  Landmark,
  Laugh,
  Megaphone,
  Mic,
  Music,
  Newspaper,
  Palette,
  Scale,
  Sparkles,
  Trophy,
  type LucideIcon,
} from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Field → glyph, matched on the profession's own words. Professions are free
 * data (top N by count), so this is a keyword table with a neutral fallback,
 * never an exhaustive map. lucide, not TransitIcon: this page's chrome is
 * lucide (the birthday and remembrance headings beside these tiles).
 */
const FIELD_ICONS: readonly [RegExp, LucideIcon][] = [
  [/drag|perform|entertain/i, Sparkles],
  [/actor|actress|film|director|screen/i, Film],
  [/sing|music|rapper|composer|dj\b/i, Music],
  [/comedian|comic/i, Laugh],
  [/host|presenter|broadcast|podcast/i, Mic],
  [/writer|author|poet|novel|playwright/i, BookOpen],
  [/journalist|editor|reporter/i, Newspaper],
  [/politic|diplomat|mayor|senator/i, Landmark],
  [/activist|advocate|organi[sz]er/i, Megaphone],
  [/lawyer|judge|jurist/i, Scale],
  [/artist|painter|designer|illustrat|sculpt/i, Palette],
  [/model|photograph|adult/i, Camera],
  [/athlet|sport|player|olymp/i, Trophy],
  [/scien|research|physic|chemist|biolog|doctor|physician/i, FlaskConical],
  [/academ|professor|teacher|historian|scholar/i, GraduationCap],
];

function fieldIcon(profession: string): LucideIcon {
  return FIELD_ICONS.find(([re]) => re.test(profession))?.[1] ?? Briefcase;
}

interface EditorialEntriesProps {
  /** Currently applied profession, so we can highlight the active tile. */
  activeProfession?: string;
  onProfessionSelect: (profession: string | undefined) => void;
}

/**
 * Editorial entry points shown on the default (unfiltered) browse view:
 * born this week, remembered this week, and the top fields as interchanges.
 *
 * The era selector deliberately does NOT live here any more. This whole block
 * is gated on `!hasAnyFilter`, so putting the P line's five stations inside it
 * meant selecting a station unmounted the line you had just used — the page's
 * primary navigation metaphor vanished at the moment it was engaged. It now
 * renders from the page itself, above the filter bar, and stays lit.
 */
export function EditorialEntries({ activeProfession, onProfessionSelect }: EditorialEntriesProps) {
  const { t, i18n } = useTranslation();
  const { facets } = useProfessionFacets(8);
  const { items: bornThisWeek } = useBornThisWeek(8, 'born');
  const { items: diedThisWeek } = useBornThisWeek(8, 'died');

  const renderStrip = (items: typeof bornThisWeek, dateField: 'birth_date' | 'death_date') => (
    // `overflow-x-auto` computes overflow-y to auto as well, so the vertical
    // padding is what keeps the hard shadow and the -2px lift from being
    // clipped by the scroll box.
    <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pt-1 pb-2">
      {items.map((p) => {
        const iso = p[dateField];
        const d = iso ? new Date(iso) : null;
        const dateLabel = d
          ? d.toLocaleDateString(i18n.language || 'en', { month: 'short', day: 'numeric' })
          : '';
        return (
          <li key={p.id} className="w-32 shrink-0">
            <LocalizedLink
              to={`/personalities/${p.slug ?? p.id}`}
              className="card-lift-sm group block bg-card no-underline text-inherit rounded-container shadow-soft"
            >
              <div className="flex h-32 w-full items-center justify-center overflow-hidden border-b border-border-hairline bg-muted">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <span className="font-display text-headline text-muted-foreground">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-13 font-bold leading-tight">{p.name}</p>
                <p className="mt-1 inline-block max-w-full truncate rounded-element bg-muted px-2 py-1 text-2xs tabular-nums text-muted-foreground">
                  {dateLabel}
                </p>
              </div>
            </LocalizedLink>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section
      className="mb-8 space-y-6"
      aria-label={t('pages.personalities.editorial.browseByField', 'Browse by field')}
    >
      {/* Born this week */}
      {bornThisWeek.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
            <Cake size={14} aria-hidden="true" />
            {t('pages.personalities.editorial.bornThisWeek', 'Born this week')}
          </h2>
          {renderStrip(bornThisWeek, 'birth_date')}
        </div>
      )}

      {/* Died this week — remembrance hook */}
      {diedThisWeek.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
            <Flower2 size={14} aria-hidden="true" />
            {t('pages.personalities.editorial.diedThisWeek', 'Remembered this week')}
          </h2>
          {renderStrip(diedThisWeek, 'death_date')}
        </div>
      )}

      {/* Top fields */}
      {facets.length > 0 && (
        <div>
          <h2 className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {t('pages.personalities.editorial.browseByField', 'Browse by field')}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {facets.slice(0, 8).map((f) => {
              const active = activeProfession === f.profession;
              const Icon = fieldIcon(f.profession);
              return (
                // Interchanges off the era line: a tile with the field's glyph
                // in a round well, the field as the title and the count as a
                // quiet second line. Active fills ink (never ink AND lift).
                <button
                  key={personalityProfessionLabel(f.profession, t)}
                  type="button"
                  onClick={() => onProfessionSelect(active ? undefined : f.profession)}
                  aria-pressed={active}
                  className={cn(
                    'group flex min-h-11 items-center gap-2 rounded-container p-2 pr-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-card shadow-soft hover:bg-surface-container',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      active ? 'bg-background text-foreground' : 'bg-surface-container',
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-13 font-bold leading-tight">
                      {personalityProfessionLabel(f.profession, t)}
                    </span>
                    <span
                      className={cn(
                        'block text-2xs tabular-nums',
                        active ? 'text-background/70' : 'text-muted-foreground',
                      )}
                    >
                      {t('pages.personalities.editorial.fieldCount', {
                        defaultValue: '{{formatted}} people',
                        count: f.count,
                        formatted: f.count.toLocaleString(i18n.language || 'en'),
                      })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
