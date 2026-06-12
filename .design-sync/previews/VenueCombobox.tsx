import { VenueCombobox } from 'queer-guide';

const VENUES = [
  { id: 'v1', name: 'SchwuZ', city: 'Berlin', state: 'BE' },
  { id: 'v2', name: 'Café Savanne', city: 'Amsterdam', state: 'NH' },
  { id: 'v3', name: 'The Stonewall Inn', city: 'New York', state: 'NY' },
  { id: 'v4', name: 'Trade Bar', city: 'Lisbon', state: '' },
];

export const Default = () => (
  <div className="w-80">
    <VenueCombobox
      venues={VENUES}
      value=""
      placeholder="Search venues…"
      onValueChange={() => {}}
    />
  </div>
);

export const Selected = () => (
  <div className="w-80">
    <VenueCombobox venues={VENUES} value="v1" onValueChange={() => {}} />
  </div>
);

export const Disabled = () => (
  <div className="w-80">
    <VenueCombobox
      venues={VENUES}
      value=""
      disabled
      placeholder="Venue locked"
      onValueChange={() => {}}
    />
  </div>
);
