import * as React from "react";
import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";

interface ProfessionAutocompleteProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

export function ProfessionAutocomplete({
  value,
  onValueChange,
  placeholder = "Select or type a profession...",
  required,
  id,
}: ProfessionAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [professions, setProfessions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchProfessions = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('personalities')
          .select('profession')
          .not('profession', 'is', null)
          .neq('profession', '')
          .order('profession');

        if (error) {
          console.error('Error fetching professions:', error);
          return;
        }

        // Extract unique professions and handle comma-separated values
        const uniqueProfessions = new Set<string>();
        
        data?.forEach(item => {
          if (item.profession) {
            // Split by comma and clean up each profession
            const professionList = item.profession.split(',').map(p => p.trim());
            professionList.forEach(profession => {
              if (profession) {
                uniqueProfessions.add(profession);
              }
            });
          }
        });

        setProfessions(Array.from(uniqueProfessions).sort());
      } catch (error) {
        console.error('Error fetching professions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfessions();
  }, []);

  const filteredProfessions = professions.filter(profession =>
    profession.toLowerCase().includes((value || '').toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-muted"
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 bg-background border shadow-md">
        <Command>
          <CommandInput 
            placeholder="Search professions..." 
            value={value}
            onValueChange={onValueChange}
          />
          <CommandList>
            {loading ? (
              <CommandEmpty>Loading professions...</CommandEmpty>
            ) : filteredProfessions.length === 0 ? (
              <CommandEmpty>
                No profession found. Type to add "{value}" as new profession.
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredProfessions.slice(0, 10).map((profession) => (
                  <CommandItem
                    key={profession}
                    value={profession}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue === value ? "" : currentValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === profession ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {profession}
                  </CommandItem>
                ))}
                {filteredProfessions.length > 10 && (
                  <CommandItem disabled>
                    ... and {filteredProfessions.length - 10} more
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}