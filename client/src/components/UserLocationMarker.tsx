import { useMemo } from 'react';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import { TbNavigationFilled, TbUserFilled } from 'react-icons/tb';
import { useMapBearing } from '../hooks/useMapBearing';
import type { UserLocation } from '../map/types';

type LngLat = [number, number];

/** Accuracy circles smaller than this are hidden: the marker already covers them. */
const MIN_ACCURACY_M = 25;
const MAX_ACCURACY_M = 1000;

/** A circle of `radiusM` meters around a point, as a closed GeoJSON ring. */
function circleRing(lng: number, lat: number, radiusM: number, steps = 48): LngLat[] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return ring;
}

/**
 * "You are here": a dark disc with a white rim and a soft pulse, holding a
 * navigation arrow that points the way you are heading (a person icon when the
 * device reports no heading), plus a faint circle for the GPS accuracy.
 */
export function UserLocationMarker({ location }: { location: UserLocation }) {
  const { lng, lat, accuracy, heading } = location;
  const mapBearing = useMapBearing();
  const showAccuracy = accuracy >= MIN_ACCURACY_M && accuracy <= MAX_ACCURACY_M;
  const hasHeading = typeof heading === 'number' && Number.isFinite(heading);

  const accuracyShape = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [circleRing(lng, lat, accuracy)] },
    }),
    [lng, lat, accuracy],
  );

  return (
    <>
      {showAccuracy && (
        <Source id="user-accuracy" type="geojson" data={accuracyShape}>
          <Layer
            id="user-accuracy-fill"
            type="fill"
            paint={{ 'fill-color': '#121212', 'fill-opacity': 0.1 }}
          />
          <Layer
            id="user-accuracy-outline"
            type="line"
            paint={{ 'line-color': '#121212', 'line-opacity': 0.35, 'line-width': 1 }}
          />
        </Source>
      )}

      <Marker longitude={lng} latitude={lat} style={{ zIndex: 12 }}>
        <div className="pointer-events-none relative flex h-11 w-11 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-ink-900/25 [animation-duration:2.4s]" />
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-white shadow-lg ring-[3px] ring-white">
            {hasHeading ? (
              <TbNavigationFilled
                className="h-4 w-4"
                // Tabler's arrow points north-east, hence the 45° correction; the marker
                // stays upright when the map turns, hence the map's rotation.
                style={{ transform: `rotate(${heading - mapBearing - 45}deg)` }}
              />
            ) : (
              <TbUserFilled className="h-4 w-4" />
            )}
          </span>
        </div>
      </Marker>
    </>
  );
}
