import { BrowserRouter } from 'react-router';
import './i18n';
import { ActiveTripProvider } from '@/hooks/useActiveTrip';
import { AppProviders } from '@/providers/AppProviders';
import { LayoutShell } from '@/components/layout/LayoutShell';
import { AppRoutes } from './routes';

const App = () => (
  <AppProviders>
    <BrowserRouter>
      <ActiveTripProvider>
        <LayoutShell>
          <AppRoutes />
        </LayoutShell>
      </ActiveTripProvider>
    </BrowserRouter>
  </AppProviders>
);

export default App;
