import ReactDOM from 'react-dom/client';
import { AppErrorBoundary, RootProviders } from '@/app/providers';
import { AuthSessionGate } from '@/features/auth-session-gate';
import '@/app/styles/global.css';
import { PopupHomePage } from '@/pages/popup-home';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Popup root element was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <AppErrorBoundary>
    <RootProviders>
      <AuthSessionGate surface="popup">
        <PopupHomePage />
      </AuthSessionGate>
    </RootProviders>
  </AppErrorBoundary>,
);
