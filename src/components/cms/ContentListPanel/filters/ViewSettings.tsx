import { CalendarDays, Columns, GanttChart, LayoutGrid, Settings2, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ContentTypeConfig } from '@/types/cms';
import { groupableFields } from '../boardGrouping';
import { dateFields } from '../dateFields';
import type { ContentView } from '../types';
import { PropertyManager } from './PropertyManager';

/**
 * Everything about how a view is presented, in one place: layout, which
 * properties show and in what order, how the board groups, and which column
 * the date views plot against.
 *
 * These used to be three separate dropdowns floating in the toolbar, appearing
 * and disappearing with the active layout. Filter and Sort stay as their own
 * top-level buttons because they are the high-frequency actions.
 */

const LAYOUTS = [
  { id: 'table', label: 'Table', Icon: Table2 },
  { id: 'gallery', label: 'Gallery', Icon: LayoutGrid },
  { id: 'board', label: 'Board', Icon: Columns },
  { id: 'timeline', label: 'Timeline', Icon: GanttChart },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
] as const;

const NONE = '__none__';

interface Props {
  config: ContentTypeConfig;
  view: ContentView;
  columns: string[];
  groupBy: string | null;
  dateField: string | null;
  onViewChange: (view: ContentView) => void;
  onColumnsChange: (columns: string[]) => void;
  onGroupByChange: (field: string | null) => void;
  onDateFieldChange: (field: string | null) => void;
}

export function ViewSettings({
  config,
  view,
  columns,
  groupBy,
  dateField,
  onViewChange,
  onColumnsChange,
  onGroupByChange,
  onDateFieldChange,
}: Props) {
  const groupable = groupableFields(config);
  const dateable = dateFields(config);
  const isDateView = view === 'timeline' || view === 'calendar';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <Settings2 size={14} className="mr-1" />
          Customise
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-4" align="end">
        <ScrollArea className="max-h-[70vh] pr-2">
          <section className="mb-4">
            <h6 className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
              Layout
            </h6>
            <div role="radiogroup" aria-label="Layout" className="grid grid-cols-2 gap-1">
              {LAYOUTS.map(({ id, label, Icon }) => (
                <Button
                  key={id}
                  role="radio"
                  aria-checked={view === id}
                  size="sm"
                  variant={view === id ? 'secondary' : 'ghost'}
                  className="h-8 justify-start"
                  onClick={() => onViewChange(id)}
                >
                  <Icon size={14} className="mr-1.5" />
                  {label}
                </Button>
              ))}
            </div>
          </section>

          <section className="mb-4">
            <h6 className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
              Properties
            </h6>
            <PropertyManager fields={config.fields} columns={columns} onChange={onColumnsChange} />
            {view !== 'table' && (
              <p className="text-xs text-muted-foreground mt-2">
                {view === 'calendar'
                  ? 'Calendar shows titles only.'
                  : `${view === 'gallery' ? 'Gallery cards' : view === 'board' ? 'Board cards' : 'Timeline rows'} show the first few properties.`}
              </p>
            )}
          </section>

          {view === 'board' && (
            <section className="mb-4">
              <h6 className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                Group by
              </h6>
              <Select
                value={groupBy ?? NONE}
                onValueChange={(v) => onGroupByChange(v === NONE ? null : v)}
              >
                <SelectTrigger className="h-8" aria-label="Group by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Status</SelectItem>
                  {groupable.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {groupable.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  No field on this type has a fixed set of values to group by.
                </p>
              )}
            </section>
          )}

          {isDateView && (
            <section>
              <h6 className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                Date field
              </h6>
              <Select
                value={dateField ?? NONE}
                onValueChange={(v) => onDateFieldChange(v === NONE ? null : v)}
              >
                <SelectTrigger className="h-8" aria-label="Date field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Always offered: every record has updated_at, so a type
                      with no date column still gets a usable date view. */}
                  <SelectItem value={NONE}>Last updated</SelectItem>
                  {dateable.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
