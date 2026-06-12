import { Skeleton } from 'queer-guide';

export const Variants = () => (
  <div className="flex w-80 items-center gap-6">
    <Skeleton variant="circular" width={48} height={48} />
    <Skeleton variant="rounded" width={96} height={64} />
    <div className="flex-1 space-y-2">
      <Skeleton variant="text" className="w-full" />
      <Skeleton variant="text" className="w-2/3" />
    </div>
  </div>
);

export const VenueCardLoading = () => (
  <div className="w-80 overflow-hidden rounded-container border">
    <Skeleton variant="rectangular" height={180} className="w-full" />
    <div className="space-y-2 p-4">
      <Skeleton variant="text" className="w-3/4 h-5" />
      <Skeleton variant="text" className="w-1/2" />
      <div className="flex gap-2 pt-2">
        <Skeleton variant="rounded" width={64} height={22} />
        <Skeleton variant="rounded" width={80} height={22} />
      </div>
    </div>
  </div>
);

export const ListLoading = () => (
  <div className="w-80 space-y-4">
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex items-center gap-4">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="w-2/3" />
          <Skeleton variant="text" className="w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

export const NoAnimation = () => (
  <div className="w-80 space-y-2">
    <Skeleton animation={false} variant="text" className="w-full" />
    <Skeleton animation={false} variant="text" className="w-3/4" />
    <Skeleton animation={false} variant="text" className="w-1/2" />
  </div>
);
