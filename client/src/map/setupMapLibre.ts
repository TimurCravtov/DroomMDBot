import { setWorkerUrl } from 'maplibre-gl';
// Self-contained worker bundle. Importing it as a URL makes Vite emit it as an
// asset, because maplibre only finds it via a runtime URL that bundlers can't see.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);
