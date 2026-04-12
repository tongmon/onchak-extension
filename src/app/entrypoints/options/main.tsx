import ReactDOM from 'react-dom/client';
import { AppErrorBoundary, RootProviders } from '@/app/providers';
import { AuthSessionGate } from '@/features/auth-session-gate';
import '@/app/styles/global.css';
import { OptionsSettingsPage } from '@/pages/options-settings';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Options root element was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <AppErrorBoundary>
    <RootProviders>
      <AuthSessionGate surface="options">
        <OptionsSettingsPage />
      </AuthSessionGate>
    </RootProviders>
  </AppErrorBoundary>,
);
