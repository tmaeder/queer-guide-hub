import { ErrorState } from 'queer-guide';
import { StaticState } from './_static';

export const WithRetry = () => (
  <div className="max-w-md">
    <StaticState />
    <ErrorState
      title="Couldn't load events."
      description="The events feed timed out. Your saved trips are unaffected."
      onRetry={() => {}}
    />
  </div>
);

export const MessageOnly = () => (
  <div className="max-w-md">
    <StaticState />
    <ErrorState message="Something went wrong while loading venues. Please try again." onRetry={() => {}} retryLabel="Reload venues" />
  </div>
);

export const WithActions = () => (
  <div className="max-w-md">
    <StaticState />
    <ErrorState
      title="Map data unavailable."
      description="We couldn't reach the map service. You can browse the list view instead."
      primaryAction={{ label: 'Open list view', onClick: () => {} }}
      secondaryAction={{ label: 'Try again', onClick: () => {} }}
    />
  </div>
);
