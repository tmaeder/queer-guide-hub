import { CountryAutocomplete } from 'queer-guide';

export const Default = () => (
  <div className="w-80">
    <CountryAutocomplete
      placeholder="Search countries…"
      onValueChange={() => {}}
    />
  </div>
);

export const WithValue = () => (
  <div className="w-80">
    <CountryAutocomplete value="Germany" onValueChange={() => {}} />
  </div>
);

export const ErrorAndDisabled = () => (
  <div className="flex w-80 flex-col gap-4">
    <CountryAutocomplete
      placeholder="Country is required"
      error
      required
      onValueChange={() => {}}
    />
    <CountryAutocomplete value="Iceland" disabled onValueChange={() => {}} />
  </div>
);
