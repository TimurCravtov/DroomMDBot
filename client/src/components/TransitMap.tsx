import 'maplibre-gl/dist/maplibre-gl.css';
import '../map/setupMapLibre';
import { useEffect } from 'react';
import { Layer, Map as MapGL, Marker, Source, useMap } from 'react-map-gl/maplibre';
import type { Route, Stop, Vehicle } from '../api';
import { MAP_STYLES, type MapStyleId } from '../map/mapStyles';
import type { UserLocation } from '../map/types';
import { TYPE_COLOR } from './typeStyles';

type LngLat = [number, number];

/** Id other components use to reach the map via useMap(). */
export const MAP_ID = 'main';

const CHISINAU: LngLat = [28.8323, 47.0245];

interface Props {
  stops: Stop[];
  routes: Route[];
  vehicles: Vehicle[];
  selectedStop: Stop | null;
  /** When set, the route's path is drawn and framed. */
  selectedRoute: Route | null;
  userLocation: UserLocation | null;
  mapStyleId: MapStyleId;
  onSelectStop: (stopId: string) => void;
}

/** Moves the viewport when the selected stop or route changes. */
function ViewController({
  selectedStop,
  routePath,
  routeId,
}: {
  selectedStop: Stop | null;
  routePath: LngLat[] | null;
  routeId: string | null;
}) {
  const { current: map } = useMap();

  useEffect(() => {
    if (map && selectedStop) {
      map.flyTo({
        center: [selectedStop.lng, selectedStop.lat],
        zoom: Math.max(map.getZoom(), 16),
      });
    }
  }, [map, selectedStop?.id]);

  useEffect(() => {
    if (!map || !routePath) return;
    const lngs = routePath.map(([lng]) => lng);
    const lats = routePath.map(([, lat]) => lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 100 },
    );
  }, [map, routeId]);

  return null;
}

export function TransitMap({
  stops,
  routes,
  vehicles,
  selectedStop,
  selectedRoute,
  userLocation,
  mapStyleId,
  onSelectStop,
}: Props) {
  const stopsById = new Map(stops.map((s) => [s.id, s]));
  const routesById = new Map(routes.map((r) => [r.id, r]));

  const routePath = selectedRoute
    ? [...selectedRoute.stopIds, selectedRoute.stopIds[0]]
        .map((id) => stopsById.get(id))
        .filter((s): s is Stop => !!s)
        .map((s): LngLat => [s.lng, s.lat])
    : null;

  return (
    <MapGL
      id={MAP_ID}
      initialViewState={{ longitude: CHISINAU[0], latitude: CHISINAU[1], zoom: 14 }}
      mapStyle={(MAP_STYLES.find((s) => s.id === mapStyleId) ?? MAP_STYLES[0]).style}
      maxPitch={0}
      style={{ width: '100%', height: '100%' }}
    >
      <ViewController
        selectedStop={selectedStop}
        routePath={routePath}
        routeId={selectedRoute?.id ?? null}
      />

      {routePath && selectedRoute && (
        <Source
          id="route"
          type="geojson"
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: routePath },
          }}
        >
          <Layer
            id="route-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': TYPE_COLOR[selectedRoute.type],
              'line-width': 4,
              'line-opacity': 0.6,
            }}
          />
        </Source>
      )}

      {stops.map((s) => {
        const selected = s.id === selectedStop?.id;
        return (
          <Marker key={s.id} longitude={s.lng} latitude={s.lat}>
            <button
              title={s.name}
              aria-label={s.name}
              onClick={() => onSelectStop(s.id)}
              className={`block rounded-full border-2 border-slate-800 ${
                selected ? 'h-5 w-5 bg-yellow-400' : 'h-3.5 w-3.5 bg-white'
              }`}
            />
          </Marker>
        );
      })}

      {userLocation && (
        <Marker longitude={userLocation.lng} latitude={userLocation.lat}>
          <div className="h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow-md ring-4 ring-blue-600/25" />
        </Marker>
      )}

      {vehicles.map((v) => {
        const route = routesById.get(v.routeId);
        if (!route) return null;
        return (
          <Marker key={v.id} longitude={v.lng} latitude={v.lat} style={{ zIndex: 10 }}>
            <div
              style={{ background: TYPE_COLOR[route.type] }}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-md"
            >
              {route.number}
            </div>
          </Marker>
        );
      })}
    </MapGL>
  );
}
