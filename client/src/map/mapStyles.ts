import type { StyleSpecification } from 'maplibre-gl';

export type MapStyleId = 'streets';

export interface MapStyleOption {
  id: MapStyleId;
  label: string;
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

export const MAP_STYLES: MapStyleOption[] = [
  {
    id: 'streets',
    label: 'Streets',
    style: rasterStyle(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], OSM_ATTRIBUTION),
  },
];
