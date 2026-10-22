import 'maplibre-gl/dist/maplibre-gl.css';
import '../map/setupMapLibre';
import { useEffect, useState } from 'react';
import { Layer, Map as MapGL, Marker, Source, useMap } from 'react-map-gl/maplibre';
import type { Place, Route, Stop, Vehicle } from '../api';
import { MAP_STYLES, type MapStyleId } from '../map/mapStyles';
import type { UserLocation } from '../map/types';
import { PlaceIcon } from './PlaceIcon';
import { TypeIcon } from './TypeBadge';
import { TYPE_COLOR } from './typeStyles';

type LngLat = [number, number];

/** Id other components use to reach the map via useMap(). */
export const MAP_ID = 'main';

const CHISINAU: LngLat = [28.8323, 47.0245];

/** From this zoom on, vehicles show their type icon and route number instead of a plain dot. */
const VEHICLE_DETAIL_ZOOM = 15;

interface Props {
  stops: Stop[];
  routes: Route[];
  vehicles: Vehicle[];
  selectedStop: Stop | null;
  /** Saved places plus the dropped pin, if any. */
  places: Place[];
  focusedPlace: Place | null;
  /** Paths of these routes are drawn and framed. */
  selectedRoutes: Route[];
  userLocation: UserLocation | null;
  mapStyleId: MapStyleId;
  onSelectStop: (stopId: string) => void;
  onSelectPlace: (place: Place) => void;
}

/** Moves the viewport when the selected stop or route changes. */
function ViewController({
  selectedStop,
  focusedPlace,
  routePoints,
  routesKey,
}: {
  selectedStop: Stop | null;
  focusedPlace: Place | null;
  /** Every point of every selected route, used to frame them all. */
  routePoints: LngLat[];
  routesKey: string;
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
    if (map && focusedPlace) {
      map.flyTo({
        center: [focusedPlace.lng, focusedPlace.lat],
        zoom: Math.max(map.getZoom(), 16),
      });
    }
  }, [map, focusedPlace?.id]);

  useEffect(() => {
    if (!map || routePoints.length === 0) return;
    const lngs = routePoints.map(([lng]) => lng);
    const lats = routePoints.map(([, lat]) => lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 100 },
    );
  }, [map, routesKey]);

  return null;
}

export function TransitMap({
  stops,
  routes,
  vehicles,
  selectedStop,
  places,
  focusedPlace,
  selectedRoutes,
  userLocation,
  mapStyleId,
  onSelectStop,
  onSelectPlace,
}: Props) {
  // Only the threshold crossing is stored, so panning and zooming don't re-render every frame.
  const [closeEnough, setCloseEnough] = useState(false);
  const stopsById = new Map(stops.map((s) => [s.id, s]));
  const routesById = new Map(routes.map((r) => [r.id, r]));

  const routePaths = selectedRoutes.map((route) => ({
    route,
    path: [...route.stopIds, route.stopIds[0]]
      .map((id) => stopsById.get(id))
      .filter((s): s is Stop => !!s)
      .map((s): LngLat => [s.lng, s.lat]),
  }));

  return (
    <MapGL
      id={MAP_ID}
      initialViewState={{ longitude: CHISINAU[0], latitude: CHISINAU[1], zoom: 14 }}
      mapStyle={(MAP_STYLES.find((s) => s.id === mapStyleId) ?? MAP_STYLES[0]).style}
      maxPitch={0}
      onZoom={(e) => setCloseEnough(e.viewState.zoom >= VEHICLE_DETAIL_ZOOM)}
      style={{ width: '100%', height: '100%' }}
    >
      <ViewController
        selectedStop={selectedStop}
        focusedPlace={focusedPlace}
        routePoints={routePaths.flatMap((p) => p.path)}
        routesKey={selectedRoutes.map((r) => r.id).join(',')}
      />

      {routePaths.map(({ route, path }) => (
        <Source
          key={route.id}
          id={`route-${route.id}`}
          type="geojson"
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: path },
          }}
        >
          <Layer
            id={`route-line-${route.id}`}
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': TYPE_COLOR[route.type],
              'line-width': 4,
              'line-opacity': 0.6,
            }}
          />
        </Source>
      ))}

      {stops.map((s) => {
        const selected = s.id === selectedStop?.id;
        return (
          <Marker key={s.id} longitude={s.lng} latitude={s.lat}>
            <button
              title={s.name}
              aria-label={s.name}
              onClick={() => onSelectStop(s.id)}
              className={`block rounded-full border-2 border-ink-800 ${
                selected ? 'h-5 w-5 bg-yellow-400' : 'h-3.5 w-3.5 bg-white'
              }`}
            />
          </Marker>
        );
      })}

      {places.map((p) => {
        const focused = p.id === focusedPlace?.id;
        return (
          <Marker key={p.id} longitude={p.lng} latitude={p.lat} style={{ zIndex: focused ? 9 : 5 }}>
            <button
              title={p.label}
              aria-label={p.label}
              onClick={() => onSelectPlace(p)}
              className={`flex items-center justify-center rounded-full bg-ink-900 text-white shadow-lg ring-2 ring-white dark:bg-white dark:text-ink-900 dark:ring-ink-900 ${
                focused ? 'h-9 w-9' : 'h-7 w-7'
              }`}
            >
              <PlaceIcon kind={p.kind} className={focused ? 'h-5 w-5' : 'h-4 w-4'} />
            </button>
          </Marker>
        );
      })}

      {userLocation && (
        <Marker longitude={userLocation.lng} latitude={userLocation.lat}>
          <div className="h-4 w-4 rounded-full border-2 border-white bg-ink-900 shadow-md ring-4 ring-ink-900/25 dark:bg-white dark:ring-white/25" />
        </Marker>
      )}

      {vehicles.map((v) => {
        const route = routesById.get(v.routeId);
        if (!route) return null;
        return (
          <Marker key={v.id} longitude={v.lng} latitude={v.lat} style={{ zIndex: 10 }}>
            {closeEnough ? (
              <div
                style={{ background: TYPE_COLOR[route.type] }}
                className="flex items-center gap-1 rounded-full border-2 border-white px-2 py-1 text-xs font-bold text-white shadow-md"
              >
                <TypeIcon type={route.type} className="h-4 w-4" />
                {route.number}
              </div>
            ) : (
              <div
                title={`${route.number}`}
                style={{ background: TYPE_COLOR[route.type] }}
                className="h-3.5 w-3.5 rounded-full border-2 border-white shadow-md"
              />
            )}
          </Marker>
        );
      })}
    </MapGL>
  );
}
