import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { ToastProvider } from './contexts/ToastContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// A rejected promise nobody caught is not a crash, but it should leave a trace.
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection', e.reason instanceof Error ? e.reason.message : e.reason);
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <ConfirmProvider>
          <ToastProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ToastProvider>
        </ConfirmProvider>
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);
