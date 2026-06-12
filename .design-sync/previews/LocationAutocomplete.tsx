import { LocationAutocomplete } from 'queer-guide';

export const Default = () => (
  <div className="w-96">
    <LocationAutocomplete
      value=""
      placeholder="Search address or place…"
      onChange={() => {}}
    />
  </div>
);

export const WithValueAndLabel = () => (
  <div className="w-96">
    <LocationAutocomplete
      label="Venue address"
      value="Mehringdamm 61, 10961 Berlin"
      onChange={() => {}}
    />
  </div>
);
