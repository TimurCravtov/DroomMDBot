import { useEffect, useState } from 'react';
import { TbMapPinFilled, TbX } from 'react-icons/tb';
import { useMap } from 'react-map-gl/maplibre';
import type { PlaceKind } from '../api';
import { useLocationInfo } from '../hooks/useTransport';
import { MAP_ID } from './TransitMap';
import { closeButton, mutedText, surface } from './ui';

export interface PickedLocation {
  lat: number;
  lng: number;
  /** User-typed name (only for custom places). */
  name: string;
  /** Description of the point from the transport client. */
  description: string;
}

interface Props {
  purpose: PlaceKind;
  onConfirm: (picked: PickedLocation) => void;
  onCancel: () => void;
}

const TITLES: Record<PlaceKind, string> = {
  home: 'Set your home',
  work: 'Set your work',
  custom: 'Add a place',
  pin: 'Select on map',
};

/** Fixed pin in the middle of the screen; the user pans the map under it and confirms. */
export function PickLocation({ purpose, onConfirm, onCancel }: Props) {
  const map = useMap()[MAP_ID];
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [name, setName] = useState('');
  const info = useLocationInfo(center);

  useEffect(() => {
    if (!map) return;
    const sync = () => {
      const c = map.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
    };
    sync();
    map.on('moveend', sync);
    return () => {
      map.off('moveend', sync);
    };
  }, [map]);

  const confirm = () => {
    if (!center) return;
    onConfirm({ ...center, name, description: info?.label ?? 'Dropped pin' });
  };

  return (
    <>
      {/* The pin's tip sits exactly on the map center. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
        <TbMapPinFilled className="h-10 w-10 text-ink-900 drop-shadow-lg dark:text-white" />
      </div>

      <div className="pointer-events-none absolute inset-x-4 top-4 z-[1000] flex justify-center">
        <div
          className={`pointer-events-auto flex items-center gap-3 rounded-full py-2 pl-5 pr-2 shadow-lg ${surface}`}
        >
          <div>
            <h2 className="text-sm font-semibold">{TITLES[purpose]}</h2>
            <p className={`text-xs ${mutedText}`}>Move the map to place the pin</p>
          </div>
          <button aria-label="Cancel" className={closeButton} onClick={onCancel}>
            <TbX className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="absolute bottom-[5.5rem] left-4 right-4 z-10 sm:right-auto sm:w-96">
        <div className={`rounded-2xl p-4 shadow-lg ${surface}`}>
          <p className="text-sm font-semibold">{info?.label ?? 'Locating…'}</p>
          {info?.nearestStop && (
            <p className={`mt-0.5 text-xs ${mutedText}`}>
              Nearest stop: {info.nearestStop.name} · {info.distanceMeters} m
            </p>
          )}

          {purpose === 'custom' && (
            <input
              value={name}
              placeholder="Name this place"
              className="mt-3 w-full rounded-lg bg-ink-100 px-3 py-2 text-sm outline-none placeholder:text-ink-400 focus:ring-2 focus:ring-ink-400 dark:bg-ink-900"
              onChange={(e) => setName(e.target.value)}
            />
          )}

          <div className="mt-3 flex gap-2">
            <button
              className="flex-1 rounded-full bg-ink-900 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-ink-900"
              disabled={!center}
              onClick={confirm}
            >
              {purpose === 'pin' ? 'Drop pin here' : 'Save here'}
            </button>
            <button
              className="rounded-full px-4 py-2 text-sm hover:bg-ink-100 dark:hover:bg-ink-700"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
