import { BrowserRouter } from 'react-router';
import './i18n';
import { ActiveTripProvider } from '@/hooks/useActiveTrip';
import { AppProviders } from '@/providers/AppProviders';
import { BreadcrumbProvider } from '@/contexts/BreadcrumbContext';
import { LayoutShell } from '@/components/layout/LayoutShell';
import { AudioPlayerProvider } from '@/hooks/useAudioPlayer';
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
            {/* Inside the router: the mini-bar links to the episode page, so
                it needs a routing context. AppProviders sits OUTSIDE the
                router, which is why the audio provider cannot live there. */}
            <AudioPlayerProvider>
              <LayoutShell>
                <AppRoutes />
              </LayoutShell>
            </AudioPlayerProvider>
          </BreadcrumbProvider>
        </ActiveTripProvider>
      </BrowserRouter>
    </AppProviders>
  </ErrorBoundary>
);

export default App;
