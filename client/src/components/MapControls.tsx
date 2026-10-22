import { useEffect, useState } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import type { UserLocation } from '../map/types';
import { MAP_ID } from './TransitMap';
import { hoverRow, roundButton, surface } from './ui';

interface Props {
  onLocated: (location: UserLocation) => void;
}

type LocateStatus = 'idle' | 'locating' | 'denied';


/** Compass (reset to north), locate-me and zoom buttons. Must be inside <MapProvider>. */
export function MapControls({ onLocated }: Props) {
  const map = useMap()[MAP_ID];
  const [bearing, setBearing] = useState(0);
  const [status, setStatus] = useState<LocateStatus>('idle');

  useEffect(() => {
    if (!map) return;
    const sync = () => setBearing(map.getBearing());
    sync();
    map.on('rotate', sync);
    return () => {
      map.off('rotate', sync);
    };
  }, [map]);

  const locate = () => {
    if (!map) return;
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onLocated({ lng: coords.longitude, lat: coords.latitude, accuracy: coords.accuracy });
        map.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: Math.max(map.getZoom(), 16),
        });
        setStatus('idle');
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        aria-label="Reset map to north"
        title="Reset to north"
        className={roundButton}
        onClick={() => map?.easeTo({ bearing: 0 })}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          style={{ transform: `rotate(${-bearing}deg)` }}
        >
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 4.5l3 7.5h-6z" fill="#dc2626" />
          <path d="M12 19.5l-3-7.5h6z" fill="currentColor" />
        </svg>
      </button>

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
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
        </svg>
      </button>

      <div className={`flex flex-col overflow-hidden rounded-full shadow-lg ${surface}`}>
        <button
          aria-label="Zoom in"
          className={`flex h-10 w-10 items-center justify-center text-xl ${hoverRow}`}
          onClick={() => map?.zoomIn()}
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          className={`flex h-10 w-10 items-center justify-center border-t border-ink-200 text-xl dark:border-ink-700 ${hoverRow}`}
          onClick={() => map?.zoomOut()}
        >
          −
        </button>
      </div>
    </div>
  );
}
