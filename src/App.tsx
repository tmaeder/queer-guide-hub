import { BrowserRouter } from 'react-router';
import './i18n';
import { ActiveTripProvider } from '@/hooks/useActiveTrip';
import { AppProviders } from '@/providers/AppProviders';
import { LayoutShell } from '@/components/layout/LayoutShell';
import { AppRoutes } from './routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const App = () => (
  <ErrorBoundary section="app-root">
    <AppProviders>
      <BrowserRouter>
        <ActiveTripProvider>
          <LayoutShell>
            <AppRoutes />
          </LayoutShell>
        </ActiveTripProvider>
      </BrowserRouter>
    </AppProviders>
  </ErrorBoundary>
);

export default App;
