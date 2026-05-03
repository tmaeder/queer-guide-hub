import * as React from "react"
import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface Venue {
  id: string
  name: string
  city: string
  state: string
  address?: string
}

interface VenueComboboxProps {
  venues: Venue[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

const CUSTOM_OPTION: Venue = { id: "custom", name: "Custom Location", city: "", state: "" }

export function VenueCombobox({
  venues,
  value,
  onValueChange,
  placeholder = "Search venues...",
  disabled = false,
  className,
}: VenueComboboxProps) {
  const [open, setOpen] = useState(false)
  const venueOptions = [CUSTOM_OPTION, ...venues]
  const selected = venueOptions.find((v) => v.id === value) || null

  const labelFor = (v: Venue) =>
    v.id === "custom" ? "Custom Location" : `${v.name} - ${v.city}${v.state ? `, ${v.state}` : ""}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected ? labelFor(selected) : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            if (itemValue === "custom") return 1
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No venue found.</CommandEmpty>
            <CommandGroup>
              {venueOptions.map((venue) => (
                <CommandItem
                  key={venue.id}
                  value={
                    venue.id === "custom"
                      ? "custom"
                      : `${venue.name} ${venue.city} ${venue.state} ${venue.address || ""}`
                  }
                  onSelect={() => {
                    onValueChange(venue.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === venue.id ? "opacity-100" : "opacity-0")}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {venue.id === "custom" ? "Custom Location" : venue.name}
                    </span>
                    {venue.id !== "custom" && (
                      <span className="text-xs text-muted-foreground">
                        {venue.city}
                        {venue.state && `, ${venue.state}`}
                        {venue.address && ` • ${venue.address}`}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
