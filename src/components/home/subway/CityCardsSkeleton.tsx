export const CITY_GUIDE_COUNT = 4;
/** Countries, and separately villages, mixed in beside the cities. */
export const PLACE_GUIDE_COUNT = 2;
const CARD_COUNT = CITY_GUIDE_COUNT + 2 * PLACE_GUIDE_COUNT;

export function CityCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: CARD_COUNT }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="motion-safe:animate-pulse overflow-hidden rounded-container bg-card"
        >
          <div className="aspect-[16/10] w-full bg-muted" />
          <div className="min-h-28 p-4">
            <div className="h-6 w-2/3 bg-muted" />
            <div className="mt-2 h-4 w-1/2 bg-muted" />
            <div className="mt-2 h-4 w-1/3 bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
