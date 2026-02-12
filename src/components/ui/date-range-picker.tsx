import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerWithRangeProps {
  className?: string
  date?: DateRange
  onSelect?: (date: DateRange | undefined) => void
}

export function DatePickerWithRange({
  date,
  onSelect,
}: DatePickerWithRangeProps) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            style={{
              width: 300,
              justifyContent: 'flex-start',
              textAlign: 'left',
              fontWeight: 400,
              ...(!date ? { color: '#999999' } : {}),
            }}
          >
            <CalendarIcon style={{ marginRight: 8, height: 16, width: 16 }} />
            {date?.from ? (
              date.to ? (
                <>
                  {date.from.toLocaleDateString()} -{" "}
                  {date.to.toLocaleDateString()}
                </>
              ) : (
                date.from.toLocaleDateString()
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent style={{ width: 'auto', padding: 0 }} align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={onSelect}
            numberOfMonths={2}
            style={{ padding: 12, pointerEvents: 'auto' }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
