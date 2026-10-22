import { useEffect, useState } from 'react';
import { TbArrowsUpDown, TbChevronRight, TbWalk, TbX } from 'react-icons/tb';
import type { Itinerary, Leg, Place } from '../api';
import { usePlan } from '../hooks/useTransport';
import type { Endpoint } from '../map/types';
import { EndpointField } from './EndpointField';
import { RouteNumber } from './RouteColors';
import { TypeIcon } from './TypeBadge';
import { closeButton, hoverRow, mutedText, surface } from './ui';

interface Props {
  from: Endpoint | null;
  to: Endpoint | null;
  onChange: (ends: { from: Endpoint | null; to: Endpoint | null }) => void;
  places: Place[];
  /** Fades the panel out, e.g. while a point is being chosen on the map. */
  hidden: boolean;
  onClose: () => void;
  /** The itinerary to draw on the map, or null for none. */
  onItineraryChange: (itinerary: Itinerary | null) => void;
  onUseMyLocation: () => Promise<Endpoint>;
  onPickOnMap: (target: 'from' | 'to') => void;
}

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

function formatDuration(seconds: number): string {
  const m = minutes(seconds);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** Walk and route icons in order: the shape of the journey at a glance. */
function LegSummary({ legs }: { legs: Leg[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {legs.map((leg, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <TbChevronRight className="h-3.5 w-3.5 text-ink-400" />}
          {leg.mode === 'walk' ? (
            <span className={`flex items-center text-xs ${mutedText}`}>
              <TbWalk className="h-4 w-4" />
              {minutes(leg.durationS)}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <TypeIcon type={leg.type!} className="h-4 w-4" />
              <RouteNumber routeId={leg.routeId!} number={leg.routeNumber!} type={leg.type!} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Step-by-step instructions for one itinerary. */
function Steps({ legs, from, to }: { legs: Leg[]; from: string; to: string }) {
  return (
    <ol className="mt-3 space-y-3 border-t border-ink-200 pt-3 text-sm dark:border-ink-700">
      {legs.map((leg, i) => {
        const target = leg.to.name ?? (i === legs.length - 1 ? to : '');
        const origin = leg.from.name ?? from;
        return (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 shrink-0">
              {leg.mode === 'walk' ? (
                <TbWalk className="h-5 w-5" />
              ) : (
                <RouteNumber routeId={leg.routeId!} number={leg.routeNumber!} type={leg.type!} />
              )}
            </span>
            <div className="min-w-0">
              {leg.mode === 'walk' ? (
                <p>
                  Walk {formatDistance(leg.distanceM)}{' '}
                  <span className={mutedText}>· {minutes(leg.durationS)} min</span>
                  <span className="block truncate">to {target}</span>
                </p>
              ) : (
                <p>
                  <span className="font-medium">
                    {leg.type} {leg.routeNumber}
                  </span>{' '}
                  <span className={mutedText}>
                    · {leg.stopCount} stop{leg.stopCount === 1 ? '' : 's'} · {minutes(leg.durationS)} min
                  </span>
                  <span className="block truncate">from {origin}</span>
                  <span className="block truncate">to {target}</span>
                  <span className={`block text-xs ${mutedText}`}>
                    Wait about {minutes(leg.waitS ?? 0)} min
                  </span>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Plan a journey: pick a start and a destination, then see itineraries (walking and
 * riding), choose one to draw it on the map, and read its steps.
 */
export function DirectionsPanel({
  from,
  to,
  onChange,
  places,
  hidden,
  onClose,
  onItineraryChange,
  onUseMyLocation,
  onPickOnMap,
}: Props) {
  const { data, loading, error } = usePlan(from, to);
  const [selected, setSelected] = useState(0);

  // A new pair of endpoints starts again from the best itinerary.
  const planKey = from && to ? `${from.lat},${from.lng}>${to.lat},${to.lng}` : '';
  useEffect(() => setSelected(0), [planKey]);

  const itinerary = data?.[selected] ?? data?.[0] ?? null;
  useEffect(() => {
    onItineraryChange(from && to ? itinerary : null);
    // `onItineraryChange` is a state setter in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary, from, to]);

  return (
    <div
      className={`absolute left-4 right-4 top-4 z-[1000] flex max-h-[calc(100vh-2rem)] flex-col transition-opacity duration-300 md:right-auto md:w-[26rem] ${
        hidden ? 'pointer-events-none opacity-0' : ''
      }`}
    >
      <div className={`relative z-10 rounded-2xl p-3 shadow-lg ${surface}`}>
        <div className="mb-2 flex items-center justify-between pl-1">
          <h2 className="text-sm font-semibold">Directions</h2>
          <button aria-label="Close directions" className={closeButton} onClick={onClose}>
            <TbX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <EndpointField
              role="from"
              value={from}
              places={places}
              onChange={(e) => onChange({ from: e, to })}
              onUseMyLocation={onUseMyLocation}
              onPickOnMap={() => onPickOnMap('from')}
            />
            <EndpointField
              role="to"
              value={to}
              places={places}
              onChange={(e) => onChange({ from, to: e })}
              onUseMyLocation={onUseMyLocation}
              onPickOnMap={() => onPickOnMap('to')}
            />
          </div>
          <button
            aria-label="Swap start and destination"
            title="Swap"
            className={`rounded-full p-2 ${hoverRow}`}
            onClick={() => onChange({ from: to, to: from })}
          >
            <TbArrowsUpDown className="h-5 w-5" />
          </button>
        </div>
      </div>

      {from && to && (
        <div className={`mt-2 min-h-0 overflow-y-auto rounded-2xl shadow-lg ${surface}`}>
          {loading && !data && <p className={`px-4 py-4 text-sm ${mutedText}`}>Finding routes…</p>}
          {error && !data && (
            <p className="px-4 py-4 text-sm text-red-600">Couldn’t plan this trip. Try again.</p>
          )}
          {data?.length === 0 && (
            <p className={`px-4 py-4 text-sm ${mutedText}`}>
              No way found between these points. Try a spot closer to a stop.
            </p>
          )}

          {data?.map((it, i) => {
            const firstRide = it.legs.find((l) => l.mode === 'transit');
            const open = i === selected;
            return (
              <div
                key={i}
                className={`${i > 0 ? 'border-t border-ink-200 dark:border-ink-700' : ''} ${
                  open ? 'bg-ink-100 dark:bg-ink-900' : ''
                }`}
              >
                <button
                  aria-expanded={open}
                  className={`w-full px-4 py-3 text-left ${open ? '' : hoverRow}`}
                  onClick={() => setSelected(i)}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold">{formatDuration(it.durationS)}</span>
                    <span className={`text-xs ${mutedText}`}>
                      {it.walkM > 0 ? `${formatDistance(it.walkM)} walk · ` : ''}
                      {it.transfers === 0 ? (firstRide ? 'direct' : 'on foot') : `${it.transfers} change`}
                    </span>
                  </div>
                  <div className="mt-1">
                    <LegSummary legs={it.legs} />
                  </div>
                  {firstRide && (
                    <p className={`mt-1 text-xs ${mutedText}`}>
                      Next {firstRide.type} {firstRide.routeNumber} in about {minutes(firstRide.waitS ?? 0)}{' '}
                      min at {firstRide.from.name}
                    </p>
                  )}
                </button>
                {open && (
                  <div className="px-4 pb-4">
                    <Steps legs={it.legs} from={from.label} to={to.label} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
