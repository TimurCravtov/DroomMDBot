import { useEffect, useState } from 'react';
import { TbMapPin, TbMapPinFilled, TbSearch, TbX } from 'react-icons/tb';
import { useMap } from 'react-map-gl/maplibre';
import type { GeocodeResult, PlaceKind } from '../api';
import { useLabels } from '../hooks/useLabels';
import { useGeocode, useLocationInfo } from '../hooks/useTransport';
import { useI18n } from '../i18n';
import { DEFAULT_PLACE_ICON, PLACE_ICONS, PLACE_ICON_KEYS } from './placeIcons';
import { MAP_ID } from './TransitMap';
import { closeButton, mutedText, surface } from './ui';

export interface PickedLocation {
  lat: number;
  lng: number;
  /** User-typed name (only for custom places). */
  name: string;
  /** Description of the point from the transport client. */
  description: string;
  /** Street address, if one was chosen and the pin hasn't been moved away from it. */
  address: string | null;
  /** Icon key chosen for a custom place. */
  icon: string;
}

/** What the chosen point is for: a kind of saved place, or one end of a journey. */
export type PickPurpose = PlaceKind | 'from' | 'to';

interface Props {
  purpose: PickPurpose;
  onConfirm: (picked: PickedLocation) => void;
  onCancel: () => void;
}

/** Roughly how far (m) the pin may drift from a chosen address before it stops counting. */
const ADDRESS_TOLERANCE_M = 30;

function approxDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (a.lat - b.lat) * 111_000;
  const dLng = (a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** Fixed pin in the middle of the screen; the user pans the map under it and confirms. */
export function PickLocation({ purpose, onConfirm, onCancel }: Props) {
  const { t } = useI18n();
  const { describeLocation } = useLabels();
  const map = useMap()[MAP_ID];
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_PLACE_ICON);
  const [addressQuery, setAddressQuery] = useState('');
  const [chosen, setChosen] = useState<GeocodeResult | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const info = useLocationInfo(center);
  const suggestions = useGeocode(addressQuery);
  const canSearchAddress = purpose !== 'pin';

  // Dragging the pin away from the chosen address drops that address.
  const address =
    chosen && center && approxDistanceMeters(center, chosen) <= ADDRESS_TOLERANCE_M
      ? chosen.label
      : null;

  const chooseAddress = (result: GeocodeResult) => {
    setChosen(result);
    setAddressQuery(result.label);
    setSuggestionsOpen(false);
    map?.flyTo({ center: [result.lng, result.lat], zoom: Math.max(map.getZoom(), 17) });
  };

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
    onConfirm({
      ...center,
      name,
      description: info ? describeLocation(info) : t('place.dropped'),
      address,
      icon,
    });
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
            <h2 className="text-sm font-semibold">{t(`pick.${purpose}`)}</h2>
            <p className={`text-xs ${mutedText}`}>{t('pick.hint')}</p>
          </div>
          <button aria-label={t('common.cancel')} className={closeButton} onClick={onCancel}>
            <TbX className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="absolute bottom-[7rem] left-4 right-4 z-10 sm:right-auto sm:w-96">
        <div className={`rounded-2xl p-4 shadow-lg ${surface}`}>
          <p className="text-sm font-semibold">
            {info ? describeLocation(info) : t('common.locating')}
          </p>
          {info?.nearestStop && (
            <p className={`mt-0.5 text-xs ${mutedText}`}>
              {t('pick.nearestStop', {
                name: info.nearestStop.name,
                distance: t('unit.m', { n: info.distanceMeters }),
              })}
            </p>
          )}

          {canSearchAddress && (
            <div className="relative mt-3">
              <TbSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={addressQuery}
                placeholder={t('pick.addressSearch')}
                className="w-full rounded-lg bg-ink-100 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-ink-400 focus:ring-2 focus:ring-ink-400 dark:bg-ink-900"
                onChange={(e) => {
                  setAddressQuery(e.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
              />
              {suggestionsOpen && suggestions.length > 0 && (
                <ul className={`absolute inset-x-0 bottom-full z-10 mb-1 overflow-hidden rounded-xl shadow-lg ${surface}`}>
                  {suggestions.map((s) => (
                    <li key={`${s.label}-${s.lat}-${s.lng}`}>
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-100 dark:hover:bg-ink-700"
                        onClick={() => chooseAddress(s)}
                      >
                        <TbMapPin className="h-4 w-4 shrink-0 text-ink-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{s.label}</span>
                          {s.detail && (
                            <span className={`block truncate text-xs ${mutedText}`}>{s.detail}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {purpose === 'custom' && (
            <input
              value={name}
              placeholder={t('pick.nameIt')}
              className="mt-3 w-full rounded-lg bg-ink-100 px-3 py-2 text-sm outline-none placeholder:text-ink-400 focus:ring-2 focus:ring-ink-400 dark:bg-ink-900"
              onChange={(e) => setName(e.target.value)}
            />
          )}

          {purpose === 'custom' && (
            <div role="radiogroup" aria-label={t('pick.icon')} className="mt-3 grid grid-cols-6 gap-1.5">
              {PLACE_ICON_KEYS.map((key) => {
                const Icon = PLACE_ICONS[key];
                const label = t(`placeIcon.${key}`);
                const selected = key === icon;
                return (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    title={label}
                    onClick={() => setIcon(key)}
                    className={`flex h-9 items-center justify-center rounded-lg ${
                      selected
                        ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900'
                        : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-700'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button
              className="flex-1 rounded-full bg-ink-900 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-ink-900"
              disabled={!center}
              onClick={confirm}
            >
              {purpose === 'pin'
                ? t('pick.dropHere')
                : purpose === 'from' || purpose === 'to'
                  ? t('pick.useThis')
                  : t('pick.saveHere')}
            </button>
            <button
              className="rounded-full px-4 py-2 text-sm hover:bg-ink-100 dark:hover:bg-ink-700"
              onClick={onCancel}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
