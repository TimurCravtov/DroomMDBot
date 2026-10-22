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
import type { Itinerary, Place, Route, Stop, TransportType, Vehicle } from '../api';
import { MAP_STYLES, type MapStyleId } from '../map/mapStyles';
import { readableTextColor } from '../map/routeColors';
import type { UserLocation } from '../map/types';
import { TbMapPinFilled } from 'react-icons/tb';
import { PlaceIcon } from './PlaceIcon';
import { useRouteColors } from './RouteColors';
import { TypeIcon } from './TypeBadge';
import { UserLocationMarker } from './UserLocationMarker';
import { TYPE_COLOR } from './typeStyles';

type LngLat = [number, number];
/** west, south, east, north */
type Bounds = [number, number, number, number];

/** Id other components use to reach the map via useMap(). */
export const MAP_ID = 'main';

const CHISINAU: LngLat = [28.8323, 47.0245];

/** From this zoom on, vehicles show their type icon and route number instead of a plain dot. */
const VEHICLE_DETAIL_ZOOM = 15;
/** Upper bound of board-number labels drawn at once, to keep the DOM small. */
const MAX_LABELS = 80;
/** Stops are too dense to draw when zoomed further out than this. */
const STOPS_MIN_ZOOM = 13.5;

const STOPS_LAYER = 'stops';
const VEHICLE_LAYER = 'vehicle-dots';

interface Props {
  stops: Stop[];
  routes: Route[];
  vehicles: Vehicle[];
  selectedStop: Stop | null;
  /** Saved places plus the dropped pin, if any. */
  places: Place[];
  focusedPlace: Place | null;
  /** A planned journey to draw and frame, if any. */
  itinerary: Itinerary | null;
  /** True while the directions panel is the small summary bar. */
  directionsCompact: boolean;
  /** These routes are drawn (using `routePaths`) and framed. */
  selectedRoutes: Route[];
  /** Drawable paths per route id, as [lng, lat] lists; routes still loading are absent. */
  routePaths: Record<string, LngLat[][]>;
  userLocation: UserLocation | null;
  mapStyleId: MapStyleId;
  onSelectStop: (stopId: string) => void;
  onSelectPlace: (place: Place) => void;
  /** Called when a vehicle (dot or pill) is clicked. */
  onSelectVehicle: (vehicle: Vehicle) => void;
}

/** Moves the viewport when the selected stop, place or routes change. */
function ViewController({
  selectedStop,
  focusedPlace,
  routePoints,
  routesKey,
  itineraryPoints,
  itineraryKey,
  directionsCompact,
}: {
  selectedStop: Stop | null;
  focusedPlace: Place | null;
  /** Every point of the planned journey, used to frame it. */
  itineraryPoints: LngLat[];
  /** Changes when a different journey is shown. */
  itineraryKey: string;
  /** The directions panel is small, so less of the map is covered. */
  directionsCompact: boolean;
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

  useEffect(() => {
    if (!map || itineraryPoints.length === 0) return;
    const lngs = itineraryPoints.map(([lng]) => lng);
    const lats = itineraryPoints.map(([, lat]) => lat);
    // Leave room for the directions panel: beside it on wide screens, above on narrow ones.
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const wide = w >= 768;
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      {
        padding: directionsCompact
          ? { top: Math.min(190, h * 0.4), bottom: 90, left: wide ? 60 : 40, right: wide ? 60 : 40 }
          : wide
            ? { top: 60, bottom: 60, left: Math.min(470, w * 0.5), right: 60 }
            : { top: Math.min(380, h * 0.55), bottom: 90, left: 40, right: 40 },
        maxZoom: 17,
      },
    );
  }, [map, itineraryKey, directionsCompact]);

  return null;
}

export function TransitMap({
  stops,
  routes,
  vehicles,
  selectedStop,
  places,
  focusedPlace,
  itinerary,
  directionsCompact,
  selectedRoutes,
  routePaths,
  userLocation,
  mapStyleId,
  onSelectStop,
  onSelectPlace,
  onSelectVehicle,
}: Props) {
  // Only the threshold crossing is stored, so panning and zooming don't re-render every frame.
  const [closeEnough, setCloseEnough] = useState(false);
  // Last settled viewport, used to render DOM markers only for vehicles that can be seen.
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [overStop, setOverStop] = useState(false);

  const routesById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const routeColors = useRouteColors();
  const colorOf = (route: Route) => routeColors[route.id] ?? TYPE_COLOR[route.type];

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
            properties: {
              type: route.type satisfies TransportType,
              vehicleId: v.id,
              color: routeColors[route.id] ?? TYPE_COLOR[route.type],
            },
            geometry: { type: 'Point' as const, coordinates: [v.lng, v.lat] as LngLat },
          },
        ];
      }),
    }),
    [vehicles, routesById, routeColors],
  );

  const drawnRoutes = selectedRoutes.filter((r) => routePaths[r.id]?.length);
  const routePoints = drawnRoutes.flatMap((r) => routePaths[r.id].flat());
  const routesKey = drawnRoutes.map((r) => r.id).join(',');

  const itineraryPoints = itinerary?.legs.flatMap((l) => l.path) ?? [];
  const itineraryKey = itinerary
    ? `${itinerary.legs.map((l) => `${l.mode}${l.routeId ?? ''}${l.path.length}`).join('|')}@${itineraryPoints[0]?.join(',')}`
    : '';

  // Vehicles inside the (slightly padded) viewport; only these get DOM markers.
  const inView = useMemo(() => {
    if (!bounds) return [];
    const [w, s, e, n] = bounds;
    const padLng = (e - w) * 0.1;
    const padLat = (n - s) * 0.1;
    return vehicles.filter(
      (v) =>
        v.lng >= w - padLng && v.lng <= e + padLng && v.lat >= s - padLat && v.lat <= n + padLat,
    );
  }, [bounds, vehicles]);

  // Board numbers are only worth showing once the view is narrowed to some routes.
  const labelled = selectedRoutes.length > 0 ? inView.slice(0, MAX_LABELS) : [];

  const syncBounds = (map: { getBounds: () => { toArray: () => number[][] } }) => {
    const [[w, s], [e, n]] = map.getBounds().toArray();
    setBounds([w, s, e, n]);
  };

  const handleClick = (e: MapLayerMouseEvent) => {
    // Features come top-most first, so a vehicle wins over the stop underneath it.
    const feature = e.features?.[0];
    if (!feature) return;
    if (feature.layer.id === VEHICLE_LAYER) {
      const vehicle = vehicles.find((v) => v.id === String(feature.properties.vehicleId));
      if (vehicle) onSelectVehicle(vehicle);
    } else if (feature.properties.id !== undefined) {
      onSelectStop(String(feature.properties.id));
    }
  };

  return (
    <MapGL
      id={MAP_ID}
      initialViewState={{ longitude: CHISINAU[0], latitude: CHISINAU[1], zoom: 14 }}
      mapStyle={(MAP_STYLES.find((s) => s.id === mapStyleId) ?? MAP_STYLES[0]).style}
      maxPitch={0}
      // Credits live in <MapCredits>: a tiny © that opens the full list.
      attributionControl={false}
      interactiveLayerIds={[STOPS_LAYER, VEHICLE_LAYER]}
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
        itineraryPoints={itineraryPoints}
        itineraryKey={itineraryKey}
        directionsCompact={directionsCompact}
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
              'line-color': colorOf(route),
              'line-width': 4,
              'line-opacity': 0.6,
            }}
          />
        </Source>
      ))}

      {/* The planned journey: dotted for walking, solid in the route's color for riding. */}
      {itinerary?.legs.map((leg, i) => (
        <Source
          key={`leg-${i}`}
          id={`leg-${i}`}
          type="geojson"
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: leg.path },
          }}
        >
          <Layer
            id={`leg-casing-${i}`}
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#ffffff', 'line-width': leg.mode === 'walk' ? 7 : 9, 'line-opacity': 0.9 }}
          />
          <Layer
            id={`leg-line-${i}`}
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={
              leg.mode === 'walk'
                ? { 'line-color': '#2b2b2b', 'line-width': 4, 'line-dasharray': [0.1, 2] }
                : {
                    'line-color': routeColors[leg.routeId ?? ''] ?? TYPE_COLOR[leg.type ?? 'bus'],
                    'line-width': 6,
                  }
            }
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

      {itinerary && itinerary.legs.length > 0 && (
        <>
          <Marker
            longitude={itinerary.legs[0].from.lng}
            latitude={itinerary.legs[0].from.lat}
            style={{ zIndex: 8 }}
          >
            <span className="block h-4 w-4 rounded-full border-[3px] border-white bg-ink-900 shadow-lg" />
          </Marker>
          <Marker
            longitude={itinerary.legs[itinerary.legs.length - 1].to.lng}
            latitude={itinerary.legs[itinerary.legs.length - 1].to.lat}
            anchor="bottom"
            style={{ zIndex: 8 }}
          >
            <TbMapPinFilled className="h-9 w-9 text-ink-900 drop-shadow-lg dark:text-white" />
          </Marker>
          {itinerary.legs
            .filter((l) => l.mode === 'transit')
            .flatMap((l) => [l.from, l.to])
            .map((p, i) => (
              <Marker key={`stop-${i}`} longitude={p.lng} latitude={p.lat} style={{ zIndex: 7 }}>
                <span className="block h-3 w-3 rounded-full border-2 border-ink-900 bg-white" />
              </Marker>
            ))}
        </>
      )}

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
              <PlaceIcon kind={p.kind} icon={p.icon} className={focused ? 'h-5 w-5' : 'h-4 w-4'} />
            </button>
          </Marker>
        );
      })}

      {userLocation && <UserLocationMarker location={userLocation} />}

      {/* Far away: plain colored dots, drawn by the map itself. */}
      <Source id="vehicles" type="geojson" data={vehiclesGeoJson}>
        <Layer
          id={VEHICLE_LAYER}
          type="circle"
          layout={{ visibility: closeEnough ? 'none' : 'visible' }}
          paint={{
            'circle-radius': 5.5,
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          }}
        />
      </Source>

      {/* Close up: icon + number pills, only for vehicles in view. */}
      {(closeEnough ? inView : []).map((v) => {
        const route = routesById.get(v.routeId);
        if (!route) return null;
        return (
          <Marker key={v.id} longitude={v.lng} latitude={v.lat} style={{ zIndex: 10 }}>
            <button
              title={`Show route ${route.number}`}
              style={{ background: colorOf(route), color: readableTextColor(colorOf(route)) }}
              className="flex items-center gap-1 rounded-full border-2 border-white px-2 py-1 text-xs font-bold shadow-md"
              onClick={(e) => {
                e.stopPropagation(); // don't also click the map underneath
                onSelectVehicle(v);
              }}
            >
              <TypeIcon type={route.type} className="h-4 w-4" />
              {route.number}
            </button>
          </Marker>
        );
      })}

      {labelled.map((v) => (
        <Marker
          key={`label-${v.id}`}
          longitude={v.lng}
          latitude={v.lat}
          anchor="top"
          offset={[0, closeEnough ? 16 : 8]}
          style={{ zIndex: 11, pointerEvents: 'none' }}
        >
          <span className="rounded bg-white/90 px-1 text-[10px] font-medium leading-4 text-ink-900 shadow dark:bg-ink-800/90 dark:text-white">
            {v.label}
          </span>
        </Marker>
      ))}
    </MapGL>
  );
}
