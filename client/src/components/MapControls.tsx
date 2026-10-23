import { useEffect, useState } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { getCurrentLocation } from '../map/geolocation';
import type { UserLocation } from '../map/types';
import { MAP_ID } from './TransitMap';
import { hoverRow, roundButton, surface } from './ui';
import { TbCompass, TbCurrentLocation, TbMinus, TbPlus } from 'react-icons/tb';

// These must be rendered inside <MapProvider>.

/** Compass whose needle follows the map's rotation; click to snap back to north. */
export function CompassButton() {
  const map = useMap()[MAP_ID];
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    if (!map) return;
    const sync = () => setBearing(map.getBearing());
    sync();
    map.on('rotate', sync);
    return () => {
      map.off('rotate', sync);
    };
  }, [map]);

  return (
    <button
      aria-label="Reset map to north"
      title="Reset to north"
      className={roundButton}
      onClick={() => map?.easeTo({ bearing: 0 })}
    >
      {/* The whole dial turns with the map, so the N stays on the side where north is. */}
      <span
        className="relative flex h-full w-full items-center justify-center"
        style={{ transform: `rotate(${-bearing}deg)` }}
      >
        <span className="absolute top-0.5 text-[9px] font-bold leading-none">N</span>
        {/* Tabler's needle points north-east, hence the extra 45°. */}
        <TbCompass className="h-5 w-5 translate-y-0.5" style={{ transform: 'rotate(-45deg)' }} />
      </span>
    </button>
  );
}

type LocateStatus = 'idle' | 'locating' | 'denied';

/** Centers the map on the user's current position. */
export function LocateButton({ onLocated }: { onLocated: (location: UserLocation) => void }) {
  const map = useMap()[MAP_ID];
  const [status, setStatus] = useState<LocateStatus>('idle');

  const locate = () => {
    if (!map) return;
    setStatus('locating');
    getCurrentLocation()
      .then((location) => {
        onLocated(location);
        // Straight to the user, whatever else was moving the map.
        map.stop();
        map.flyTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 16) });
        setStatus('idle');
      })
      .catch(() => setStatus('denied'));
  };

  return (
    <button
      aria-label="Show my location"
      title={
        status === 'denied' ? 'Location unavailable — check browser permissions' : 'Show my location'
      }
      className={`${roundButton} ${status === 'denied' ? '!text-red-500' : ''} ${
        status === 'locating' ? 'animate-pulse' : ''
      }`}
      onClick={locate}
    >
      <TbCurrentLocation className="h-6 w-6" />
    </button>
  );
}

/** Horizontal − / + pill. */
export function ZoomButtons() {
  const map = useMap()[MAP_ID];
  const half = `flex h-10 w-10 items-center justify-center text-xl ${hoverRow}`;

  return (
    <div className={`flex overflow-hidden rounded-full shadow-lg ${surface}`}>
      <button aria-label="Zoom out" className={half} onClick={() => map?.zoomOut()}>
        <TbMinus className="h-5 w-5" />
      </button>
      <button
        aria-label="Zoom in"
        className={`${half} border-l border-ink-200 dark:border-ink-700`}
        onClick={() => map?.zoomIn()}
      >
        <TbPlus className="h-5 w-5" />
      </button>
    </div>
  );
}
