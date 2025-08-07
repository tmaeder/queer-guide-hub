import React, { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  address?: string;
}

interface VenueComboboxProps {
  venues: Venue[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function VenueCombobox({
  venues,
  value,
  onValueChange,
  placeholder = "Search venues...",
  disabled = false,
  className,
}: VenueComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedVenue = venues.find((venue) => venue.id === value);

  const venueOptions = [
    { id: "custom", name: "Custom Location", city: "", state: "" },
    ...venues,
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between", className)}
        >
          {value ? (
            value === "custom" ? (
              "Custom Location"
            ) : selectedVenue ? (
              <span className="truncate">
                {selectedVenue.name} - {selectedVenue.city}
                {selectedVenue.state && `, ${selectedVenue.state}`}
              </span>
            ) : (
              placeholder
            )
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" style={{ width: "var(--radix-popover-trigger-width)" }}>
        <Command>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Search venues by name, city, or address..."
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <CommandList>
            <CommandEmpty>No venues found.</CommandEmpty>
            <CommandGroup>
              {venueOptions.map((venue) => (
                <CommandItem
                  key={venue.id}
                  value={`${venue.name} ${venue.city} ${venue.state} ${venue.address || ''}`}
                  onSelect={() => {
                    onValueChange(venue.id === value ? "" : venue.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === venue.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {venue.id === "custom" ? "Custom Location" : venue.name}
                    </span>
                    {venue.id !== "custom" && (
                      <span className="text-sm text-muted-foreground">
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
  );
}