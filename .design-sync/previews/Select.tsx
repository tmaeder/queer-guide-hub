import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  Label,
} from 'queer-guide';

/* HARNESS SHIM — see Input.tsx / learnings/wave-forms.md. Restores the
   production (flattened-layer) border rendering the harness CSS loses. */
const BorderFix = () => (
  <style>{`
    .border{border-width:1px}
    .border-input{border-color:hsl(var(--input))}
    .border-border\\/60{border-color:hsl(var(--border)/.6)}
  `}</style>
);

export const ClosedWithValue = () => (
  <div className="w-64">
    <BorderFix />
    <Select defaultValue="berlin">
      <SelectTrigger aria-label="Destination">
        <SelectValue placeholder="Choose a destination" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="berlin">Berlin</SelectItem>
        <SelectItem value="barcelona">Barcelona</SelectItem>
        <SelectItem value="amsterdam">Amsterdam</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

export const Placeholder = () => (
  <div className="flex w-64 flex-col gap-2">
    <BorderFix />
    <Label htmlFor="venue-type">Venue type</Label>
    <Select>
      <SelectTrigger id="venue-type">
        <SelectValue placeholder="All venue types" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="bar">Bar</SelectItem>
        <SelectItem value="club">Club</SelectItem>
        <SelectItem value="cafe">Café</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

export const OpenMenu = () => (
  <div className="flex h-72 w-64 flex-col">
    <BorderFix />
    <Select defaultValue="pride" open>
      <SelectTrigger aria-label="Event category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Festivals</SelectLabel>
          <SelectItem value="pride">Pride parade</SelectItem>
          <SelectItem value="film">Queer film festival</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Nightlife</SelectLabel>
          <SelectItem value="drag">Drag show</SelectItem>
          <SelectItem value="club">Club night</SelectItem>
          <SelectItem value="karaoke" disabled>
            Karaoke (sold out)
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);

export const Disabled = () => (
  <div className="w-64">
    <BorderFix />
    <Select defaultValue="madrid" disabled>
      <SelectTrigger aria-label="Locked destination">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="madrid">Madrid</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
