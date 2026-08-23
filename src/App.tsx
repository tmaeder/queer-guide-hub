import { BrowserRouter } from 'react-router';
import './i18n';
import { ActiveTripProvider } from '@/hooks/useActiveTrip';
import { AppProviders } from '@/providers/AppProviders';
import { BreadcrumbProvider } from '@/contexts/BreadcrumbContext';
import { LayoutShell } from '@/components/layout/LayoutShell';
import { ScrollManager } from '@/components/routing/ScrollManager';
import { AppRoutes } from './routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const App = () => (
  <ErrorBoundary section="app-root">
    <AppProviders>
      <BrowserRouter>
        {/* Owns the scroll offset across navigation. Renders null; mounted
            directly under the router so it sees every location change,
            including ones that never reach LayoutShell's subtree. */}
        <ScrollManager />
        <ActiveTripProvider>
          <BreadcrumbProvider>
            <LayoutShell>
              <AppRoutes />
            </LayoutShell>
          </BreadcrumbProvider>
        </ActiveTripProvider>
      </BrowserRouter>
    </AppProviders>
  </ErrorBoundary>
);

export default App;
