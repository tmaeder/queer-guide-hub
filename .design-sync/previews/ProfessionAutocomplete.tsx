import { ProfessionAutocomplete } from 'queer-guide';

export const Default = () => (
  <div className="w-80">
    <ProfessionAutocomplete
      placeholder="Search professions…"
      onValueChange={() => {}}
    />
  </div>
);

export const WithValue = () => (
  <div className="w-80">
    <ProfessionAutocomplete value="Drag performer" onValueChange={() => {}} />
  </div>
);
