import { CalendarIcon } from 'lucide-react';
import { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DatePickerWithRangeProps {
  className?: string;
  date?: DateRange;
  onSelect?: (date: DateRange | undefined) => void;
}

export function DatePickerWithRange({ date, onSelect }: DatePickerWithRangeProps) {
  return (
    <div className="grid gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={'outline'}
            style={{
              width: 300,
              justifyContent: 'flex-start',
              textAlign: 'left',
              fontWeight: 400,
              ...(!date ? { color: 'hsl(var(--muted-foreground))' } : {}),
            }}
          >
            <CalendarIcon size={16} className="mr-2" />
            {date?.from ? (
              date.to ? (
                <>
                  {date.from.toLocaleDateString()} - {date.to.toLocaleDateString()}
                </>
              ) : (
                date.from.toLocaleDateString()
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent style={{ width: 'auto' }} className="p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={onSelect}
            numberOfMonths={2}
            style={{ pointerEvents: 'auto' }}
            className="p-4"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
