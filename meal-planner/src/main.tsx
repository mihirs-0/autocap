import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { NotifyProvider } from './ui';
import { registerServiceWorker } from './swRegister';
import './styles.css';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotifyProvider>
      <App />
    </NotifyProvider>
  </StrictMode>,
);
