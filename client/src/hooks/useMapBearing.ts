import { useEffect, useState } from 'react';
import { useMap } from 'react-map-gl/maplibre';

/**
 * The map's rotation in degrees clockwise (0 when north is up), kept current as the map
 * turns. Needed by anything drawn as a DOM marker that points in a compass direction: such
 * a marker stays upright on screen, so it must be turned by the opposite of the map's
 * rotation to keep pointing the right way. Render it inside the map.
 */
export function useMapBearing(): number {
  const { current: map } = useMap();
  const [bearing, setBearing] = useState(() => map?.getBearing() ?? 0);

  useEffect(() => {
    if (!map) return;
    const sync = () => setBearing(map.getBearing());
    sync();
    map.on('rotate', sync);
    return () => {
      map.off('rotate', sync);
    };
  }, [map]);

  return bearing;
}
