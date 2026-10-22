import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MapProvider } from 'react-map-gl/maplibre';
import { createClient } from './api';
import { TransportProvider } from './api/context';
import { initTelegram } from './api/http/auth';
import { App } from './App';
import './styles.css';

const client = createClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TransportProvider client={client}>
      <MapProvider>
        <App />
      </MapProvider>
    </TransportProvider>
  </StrictMode>,
);

// Inside Telegram: tell it the page is ready and use the full height. No-op in a browser.
initTelegram();
