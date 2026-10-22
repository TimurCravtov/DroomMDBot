import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  ZoomControl,
} from 'react-leaflet';
import type { Route, Stop, TransportType, Vehicle } from '../api';
import { TYPE_COLOR } from './typeStyles';

const CHISINAU: [number, number] = [47.0245, 28.8323];

interface Props {
  stops: Stop[];
  routes: Route[];
  vehicles: Vehicle[];
  selectedStop: Stop | null;
  /** When set, the route's path is drawn and framed. */
  selectedRoute: Route | null;
  onSelectStop: (stopId: string) => void;
}

function vehicleIcon(label: string, type: TransportType) {
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="background:${TYPE_COLOR[type]}" class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-md">${label}</div>`,
  });
}

/** Moves the viewport when the selected stop or route changes. */
function ViewController({
  selectedStop,
  routePath,
  routeId,
}: {
  selectedStop: Stop | null;
  routePath: [number, number][] | null;
  routeId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedStop) {
      map.flyTo([selectedStop.lat, selectedStop.lng], Math.max(map.getZoom(), 16));
    }
  }, [map, selectedStop?.id]);

  useEffect(() => {
    if (routePath) map.fitBounds(routePath, { padding: [100, 100] });
  }, [map, routeId]);

  return null;
}

export function TransitMap({
  stops,
  routes,
  vehicles,
  selectedStop,
  selectedRoute,
  onSelectStop,
}: Props) {
  const stopsById = new Map(stops.map((s) => [s.id, s]));
  const routesById = new Map(routes.map((r) => [r.id, r]));

  const routePath = selectedRoute
    ? [...selectedRoute.stopIds, selectedRoute.stopIds[0]]
        .map((id) => stopsById.get(id))
        .filter((s): s is Stop => !!s)
        .map((s): [number, number] => [s.lat, s.lng])
    : null;

  return (
    <MapContainer center={CHISINAU} zoom={14} zoomControl={false} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl position="bottomright" />
      <ViewController
        selectedStop={selectedStop}
        routePath={routePath}
        routeId={selectedRoute?.id ?? null}
      />

      {routePath && selectedRoute && (
        <Polyline
          positions={routePath}
          pathOptions={{ color: TYPE_COLOR[selectedRoute.type], weight: 4, opacity: 0.6 }}
        />
      )}

      {stops.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={s.id === selectedStop?.id ? 9 : 6}
          pathOptions={{
            color: '#1e293b',
            weight: 2,
            fillColor: s.id === selectedStop?.id ? '#facc15' : '#ffffff',
            fillOpacity: 1,
          }}
          eventHandlers={{ click: () => onSelectStop(s.id) }}
        >
          <Tooltip>{s.name}</Tooltip>
        </CircleMarker>
      ))}

      {vehicles.map((v) => {
        const route = routesById.get(v.routeId);
        if (!route) return null;
        return (
          <Marker
            key={v.id}
            position={[v.lat, v.lng]}
            icon={vehicleIcon(route.number, route.type)}
            zIndexOffset={1000}
          />
        );
      })}
    </MapContainer>
  );
}
