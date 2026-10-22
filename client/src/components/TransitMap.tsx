import type { ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../map/setupMapLibre';
import { useEffect, useMemo, useState } from 'react';
import {
  Layer,
  Map as MapGL,
  Marker,
  Source,
  useMap,
  type MapLayerMouseEvent,
} from 'react-map-gl/maplibre';
import type { Place, Route, Stop, TransportType, Vehicle } from '../api';
import { MAP_STYLES, type MapStyleId } from '../map/mapStyles';
import type { UserLocation } from '../map/types';
import { PlaceIcon } from './PlaceIcon';
import { TypeIcon } from './TypeBadge';
import { TYPE_COLOR } from './typeStyles';

type LngLat = [number, number];
/** west, south, east, north */
type Bounds = [number, number, number, number];

/** Id other components use to reach the map via useMap(). */
export const MAP_ID = 'main';

const CHISINAU: LngLat = [28.8323, 47.0245];

/** From this zoom on, vehicles show their type icon and route number instead of a plain dot. */
const VEHICLE_DETAIL_ZOOM = 15;
/** Stops are too dense to draw when zoomed further out than this. */
const STOPS_MIN_ZOOM = 13.5;

const STOPS_LAYER = 'stops';

const typeColorExpression: ExpressionSpecification = [
  'match',
  ['get', 'type'],
  'trolleybus',
  TYPE_COLOR.trolleybus,
  'bus',
  TYPE_COLOR.bus,
  'minibus',
  TYPE_COLOR.minibus,
  '#737373',
];

interface Props {
  stops: Stop[];
  routes: Route[];
  vehicles: Vehicle[];
  selectedStop: Stop | null;
  /** Saved places plus the dropped pin, if any. */
  places: Place[];
  focusedPlace: Place | null;
  /** These routes are drawn (using `routePaths`) and framed. */
  selectedRoutes: Route[];
  /** Drawable paths per route id, as [lng, lat] lists; routes still loading are absent. */
  routePaths: Record<string, LngLat[][]>;
  userLocation: UserLocation | null;
  mapStyleId: MapStyleId;
  onSelectStop: (stopId: string) => void;
  onSelectPlace: (place: Place) => void;
}

/** Moves the viewport when the selected stop, place or routes change. */
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
  /** Changes when the set of drawn routes changes. */
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
  routePaths,
  userLocation,
  mapStyleId,
  onSelectStop,
  onSelectPlace,
}: Props) {
  // Only the threshold crossing is stored, so panning and zooming don't re-render every frame.
  const [closeEnough, setCloseEnough] = useState(false);
  // Last settled viewport, used to render DOM markers only for vehicles that can be seen.
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [overStop, setOverStop] = useState(false);

  const routesById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);

  // Thousands of stops and hundreds of vehicles are drawn as map layers, not DOM markers.
  const stopsGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: stops.map((s) => ({
        type: 'Feature' as const,
        properties: { id: s.id, name: s.name },
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] as LngLat },
      })),
    }),
    [stops],
  );

  const vehiclesGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: vehicles.flatMap((v) => {
        const route = routesById.get(v.routeId);
        if (!route) return [];
        return [
          {
            type: 'Feature' as const,
            properties: { type: route.type satisfies TransportType, number: route.number },
            geometry: { type: 'Point' as const, coordinates: [v.lng, v.lat] as LngLat },
          },
        ];
      }),
    }),
    [vehicles, routesById],
  );

  const drawnRoutes = selectedRoutes.filter((r) => routePaths[r.id]?.length);
  const routePoints = drawnRoutes.flatMap((r) => routePaths[r.id].flat());
  const routesKey = drawnRoutes.map((r) => r.id).join(',');

  const visibleVehicles = useMemo(() => {
    if (!closeEnough || !bounds) return [];
    const [w, s, e, n] = bounds;
    const padLng = (e - w) * 0.1;
    const padLat = (n - s) * 0.1;
    return vehicles.filter(
      (v) =>
        v.lng >= w - padLng && v.lng <= e + padLng && v.lat >= s - padLat && v.lat <= n + padLat,
    );
  }, [closeEnough, bounds, vehicles]);

  const syncBounds = (map: { getBounds: () => { toArray: () => number[][] } }) => {
    const [[w, s], [e, n]] = map.getBounds().toArray();
    setBounds([w, s, e, n]);
  };

  const handleClick = (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id;
    if (id !== undefined) onSelectStop(String(id));
  };

  return (
    <MapGL
      id={MAP_ID}
      initialViewState={{ longitude: CHISINAU[0], latitude: CHISINAU[1], zoom: 14 }}
      mapStyle={(MAP_STYLES.find((s) => s.id === mapStyleId) ?? MAP_STYLES[0]).style}
      maxPitch={0}
      interactiveLayerIds={[STOPS_LAYER]}
      cursor={overStop ? 'pointer' : undefined}
      onMouseEnter={() => setOverStop(true)}
      onMouseLeave={() => setOverStop(false)}
      onClick={handleClick}
      onLoad={(e) => syncBounds(e.target)}
      onMoveEnd={(e) => syncBounds(e.target)}
      onZoom={(e) => setCloseEnough(e.viewState.zoom >= VEHICLE_DETAIL_ZOOM)}
      style={{ width: '100%', height: '100%' }}
    >
      <ViewController
        selectedStop={selectedStop}
        focusedPlace={focusedPlace}
        routePoints={routePoints}
        routesKey={routesKey}
      />

      {drawnRoutes.map((route) => (
        <Source
          key={route.id}
          id={`route-${route.id}`}
          type="geojson"
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'MultiLineString', coordinates: routePaths[route.id] },
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

      <Source id="stops" type="geojson" data={stopsGeoJson}>
        <Layer
          id={STOPS_LAYER}
          type="circle"
          minzoom={STOPS_MIN_ZOOM}
          paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13.5, 3, 16, 6],
            'circle-color': '#ffffff',
            'circle-stroke-color': '#1f1f1f',
            'circle-stroke-width': 1.5,
          }}
        />
        <Layer
          id="stop-selected"
          type="circle"
          filter={['==', ['get', 'id'], selectedStop?.id ?? '']}
          paint={{
            'circle-radius': 9,
            'circle-color': '#facc15',
            'circle-stroke-color': '#1f1f1f',
            'circle-stroke-width': 2,
          }}
        />
      </Source>

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

      {/* Far away: plain colored dots, drawn by the map itself. */}
      <Source id="vehicles" type="geojson" data={vehiclesGeoJson}>
        <Layer
          id="vehicle-dots"
          type="circle"
          layout={{ visibility: closeEnough ? 'none' : 'visible' }}
          paint={{
            'circle-radius': 5.5,
            'circle-color': typeColorExpression,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          }}
        />
      </Source>

      {/* Close up: icon + number pills, only for vehicles in view. */}
      {visibleVehicles.map((v) => {
        const route = routesById.get(v.routeId);
        if (!route) return null;
        return (
          <Marker key={v.id} longitude={v.lng} latitude={v.lat} style={{ zIndex: 10 }}>
            <div
              style={{ background: TYPE_COLOR[route.type] }}
              className="flex items-center gap-1 rounded-full border-2 border-white px-2 py-1 text-xs font-bold text-white shadow-md"
            >
              <TypeIcon type={route.type} className="h-4 w-4" />
              {route.number}
            </div>
          </Marker>
        );
      })}
    </MapGL>
  );
}
