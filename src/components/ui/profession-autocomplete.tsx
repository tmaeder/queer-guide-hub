import { useState, useEffect } from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
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
import { supabase } from "@/integrations/supabase/client"

interface ProfessionAutocompleteProps {
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  required?: boolean
  id?: string
}

export function ProfessionAutocomplete({
  value,
  onValueChange,
  placeholder = "Select or type a profession...",
  required,
  id,
}: ProfessionAutocompleteProps) {
  const [professions, setProfessions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const fetchProfessions = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from("professions" as never)
          .select("name" as never)
          .eq("is_active" as never, true as never)
          .order("sort_order" as never, { ascending: true })
        if (error) throw error
        setProfessions((data as { name: string }[]).map((r) => r.name))
      } catch (err) {
        console.error("Error fetching professions:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchProfessions()
  }, [])

  const showCreate = search && !professions.some((p) => p.toLowerCase() === search.toLowerCase())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate">{value || placeholder}</span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" aria-label="Loading" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search profession..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No profession found.</CommandEmpty>
            <CommandGroup>
              {professions.map((profession) => (
                <CommandItem
                  key={profession}
                  value={profession}
                  onSelect={(selected) => {
                    onValueChange(selected)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === profession ? "opacity-100" : "opacity-0")}
                  />
                  {profession}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  value={search}
                  onSelect={() => {
                    onValueChange(search)
                    setOpen(false)
                  }}
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  Use "{search}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
