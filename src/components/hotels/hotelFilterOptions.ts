export const HOTEL_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'bnb', label: 'B&B' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'guesthouse', label: 'Guesthouse' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'resort', label: 'Resort' },
];

export const HOTEL_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  HOTEL_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export const HOTEL_PRICE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '1', label: '$ Budget' },
  { value: '2', label: '$$ Mid-Range' },
  { value: '3', label: '$$$ Upscale' },
  { value: '4', label: '$$$$ Luxury' },
];

export const HOTEL_PRICE_LABEL: Record<string, string> = Object.fromEntries(
  HOTEL_PRICE_OPTIONS.map((o) => [o.value, o.label]),
);
