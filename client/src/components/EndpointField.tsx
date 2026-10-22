import { useRef, useState, type ReactNode } from 'react';
import { TbCircle, TbCurrentLocation, TbMap2, TbMapPin } from 'react-icons/tb';
import type { Place } from '../api';
import { useGeocode, useSearch } from '../hooks/useTransport';
import type { Endpoint } from '../map/types';
import { PlaceIcon } from './PlaceIcon';
import { hoverRow, mutedText, surface } from './ui';

interface Props {
  /** "From" or "To": names the field and picks its marker icon. */
  role: 'from' | 'to';
  value: Endpoint | null;
  places: Place[];
  onChange: (endpoint: Endpoint) => void;
  /** Resolves to the device's position as an endpoint; rejects if unavailable. */
  onUseMyLocation: () => Promise<Endpoint>;
  onPickOnMap: () => void;
}

function Option({
  icon,
  title,
  detail,
  onChoose,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  onChoose: () => void;
}) {
  return (
    <li>
      {/* onMouseDown fires before the input blurs, so the list is still there to click. */}
      <button
        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${hoverRow}`}
        onMouseDown={(e) => {
          e.preventDefault();
          onChoose();
        }}
      >
        <span className="shrink-0 text-ink-400">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title}</span>
          {detail && <span className={`block truncate text-xs ${mutedText}`}>{detail}</span>}
        </span>
      </button>
    </li>
  );
}

/**
 * Input for one end of a journey. Focusing it offers your location, saved places and
 * "choose on map"; typing searches stops, saved places and addresses.
 */
export function EndpointField({
  role,
  value,
  places,
  onChange,
  onUseMyLocation,
  onPickOnMap,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [locationError, setLocationError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data } = useSearch(query);
  const locations = useGeocode(query);
  const hasQuery = query.trim() !== '';

  const finish = () => {
    setEditing(false);
    setQuery('');
    inputRef.current?.blur();
  };
  const choose = (endpoint: Endpoint) => {
    onChange(endpoint);
    finish();
  };
  const choosePlace = (p: Place) =>
    choose({ label: p.label, lat: p.lat, lng: p.lng, kind: 'place' });

  const useMyLocation = () => {
    setLocationError(false);
    onUseMyLocation().then(choose, () => setLocationError(true));
  };

  const stopOptions = hasQuery ? (data?.stops ?? []).slice(0, 4) : [];
  const placeOptions = hasQuery ? (data?.places ?? []) : places;

  return (
    <div className="relative">
      <label className="flex items-center gap-3 rounded-xl bg-ink-100 px-3 py-2 focus-within:ring-2 focus-within:ring-ink-400 dark:bg-ink-900">
        {role === 'from' ? (
          <TbCircle className="h-4 w-4 shrink-0" />
        ) : (
          <TbMapPin className="h-4 w-4 shrink-0" />
        )}
        <input
          ref={inputRef}
          value={editing ? query : (value?.label ?? '')}
          placeholder={role === 'from' ? 'Choose starting point' : 'Choose destination'}
          aria-label={role === 'from' ? 'From' : 'To'}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
          onFocus={() => {
            setEditing(true);
            setQuery('');
          }}
          onBlur={finish}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && finish()}
        />
      </label>

      {editing && (
        <ul
          className={`absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl py-1 shadow-lg ${surface}`}
        >
          {!hasQuery && (
            <Option
              icon={<TbCurrentLocation className="h-5 w-5" />}
              title="My location"
              detail={locationError ? 'Location unavailable — check browser permissions' : undefined}
              onChoose={useMyLocation}
            />
          )}

          {placeOptions.map((p) => (
            <Option
              key={p.id}
              icon={<PlaceIcon kind={p.kind} icon={p.icon} />}
              title={p.label}
              detail={p.address}
              onChoose={() => choosePlace(p)}
            />
          ))}

          {stopOptions.map((s) => (
            <Option
              key={s.id}
              icon={<TbMapPin className="h-5 w-5" />}
              title={s.name}
              detail={`Stop · routes ${s.routeNumbers.slice(0, 6).join(', ')}`}
              onChoose={() => choose({ label: s.name, lat: s.lat, lng: s.lng, kind: 'stop' })}
            />
          ))}

          {locations.map((l) => (
            <Option
              key={`${l.label}-${l.lat}-${l.lng}`}
              icon={<TbMapPin className="h-5 w-5" />}
              title={l.label}
              detail={l.detail}
              onChoose={() => choose({ label: l.label, lat: l.lat, lng: l.lng, kind: 'address' })}
            />
          ))}

          <Option
            icon={<TbMap2 className="h-5 w-5" />}
            title="Choose on map"
            onChoose={() => {
              finish();
              onPickOnMap();
            }}
          />
        </ul>
      )}
    </div>
  );
}
