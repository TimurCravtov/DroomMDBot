import type { StyleSpecification } from 'maplibre-gl';

export type MapStyleId = 'streets' | 'light' | 'dark' | 'satellite' | 'topo';

export interface MapStyleOption {
  id: MapStyleId;
  style: StyleSpecification;
}

/** A style made of a single raster tile layer; needs no API key or vector tile server. */
function rasterStyle(tiles: string[], attribution: string, maxzoom = 19): StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles, tileSize: 256, maxzoom, attribution } },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION = `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`;

/** Free key from https://www.carto.com/basemaps/apikey/ ; without one CARTO tiles carry a watermark. */
const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY as string | undefined;
const cartoTiles = (name: string) =>
  ['a', 'b', 'c', 'd'].map(
    (s) => `https://${s}.basemaps.cartocdn.com/rastertiles/${name}/{z}/{x}/{y}.png?key=${CARTO_KEY}`,
  );

const ALL_MAP_STYLES: MapStyleOption[] = [
  {
    id: 'streets',
    style: rasterStyle(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], OSM_ATTRIBUTION),
  },
  {
    id: 'light',
    style: rasterStyle(cartoTiles('light_all'), CARTO_ATTRIBUTION, 20),
  },
  {
    id: 'dark',
    style: rasterStyle(cartoTiles('dark_all'), CARTO_ATTRIBUTION, 20),
  },
  {
    id: 'satellite',
    style: rasterStyle(
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    ),
  },
  {
    id: 'topo',
    style: rasterStyle(
      ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
      `${OSM_ATTRIBUTION}, <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
      17,
    ),
  },
];

/** Light and Dark are hidden when no CARTO key is configured. */
export const MAP_STYLES = ALL_MAP_STYLES.filter(
  (s) => CARTO_KEY || (s.id !== 'light' && s.id !== 'dark'),
);

export const DEFAULT_MAP_STYLE: MapStyleId = 'streets';

const STORAGE_KEY = 'mapStyle';

export function loadMapStyleId(): MapStyleId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (MAP_STYLES.some((s) => s.id === saved)) return saved as MapStyleId;
  } catch {
    // storage unavailable (private mode etc.)
  }
  return DEFAULT_MAP_STYLE;
}

export function saveMapStyleId(id: MapStyleId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}
