import { Loading } from 'queer-guide';

// The dot animation references the `pulse` keyframes; under the frozen capture
// clock the dots simply hold their initial (fully visible) frame.

export const Default = () => (
  <div className="w-64 py-4">
    <Loading />
  </div>
);

export const Sizes = () => (
  <div className="flex w-80 items-center justify-between py-4">
    <Loading size="sm" />
    <Loading size="md" />
    <Loading size="lg" />
  </div>
);

export const WithText = () => (
  <div className="w-80 py-4">
    <Loading size="md" text="Loading venues near you" />
  </div>
);
